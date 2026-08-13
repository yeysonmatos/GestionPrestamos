-- Revisión integral del borrado de préstamos (09 Ago 2026).
-- 1) total_paid del cliente = TODO lo pagado (amount: capital + interés + mora),
--    no solo capital, para que el perfil refleje lo que el cliente realmente pagó
--    y siga sobreviviendo al borrado del préstamo.
-- 2) RLS de payments separada: SELECT amplio (pagos propios por user_id) pero
--    INSERT/UPDATE/DELETE restringidos a préstamos propios (un pago huérfano ya no se puede
--    modificar ni reasignar a otra cuenta).
-- Idempotente. Vía exec-post-delete-review.mjs

-- --- 1) update_client_stats: total_paid = SUM(amount) ---
CREATE OR REPLACE FUNCTION public.update_client_stats(p_client_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_late_loans INTEGER;
  v_paid_loans INTEGER;
  v_total_loans INTEGER;
  v_active_loans INTEGER;
  v_score INTEGER;
BEGIN
  -- Guarda de seguridad: solo el dueño del cliente (o el sistema vía cron/management
  --  conectado como postgres) puede recalcular sus estadísticas.
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
       AND current_user <> 'postgres' THEN
      RETURN;
    END IF;
  ELSIF auth.uid() <> (SELECT user_id FROM clients WHERE id = p_client_id) THEN
    RETURN;
  END IF;

  -- Mora real: préstamos con al menos una cuota vencida hoy (no archivados).
  v_late_loans  := (SELECT COUNT(DISTINCT l.id) FROM loans l
                    WHERE l.client_id = p_client_id AND l.deleted_at IS NULL
                    AND EXISTS (
                      SELECT 1 FROM installments i
                      WHERE i.loan_id = l.id
                        AND i.status IN ('pending','partial','late')
                        AND i.due_date < CURRENT_DATE
                    ));
  v_paid_loans  := (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND status = 'paid' AND deleted_at IS NULL);
  v_total_loans := (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND deleted_at IS NULL);
  v_active_loans := (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND status IN ('active','late','late_1_30','late_31_60','late_61_90') AND deleted_at IS NULL);

  v_score := 50;
  IF v_late_loans = 0 THEN v_score := v_score + 25; END IF;
  IF v_paid_loans > 0 THEN v_score := v_score + 15; END IF;
  v_score := v_score - (v_late_loans * 10);
  v_score := GREATEST(0, LEAST(100, v_score));

  UPDATE clients SET
    total_loans     = v_total_loans,
    active_loans    = v_active_loans,
    status          = CASE WHEN v_active_loans > 0 THEN 'active' ELSE 'inactive' END,
    paid_loans      = v_paid_loans,
    late_loans      = v_late_loans,
    total_borrowed  = (SELECT COALESCE(SUM(amount),0) FROM loans WHERE client_id = p_client_id AND deleted_at IS NULL),
    total_interest  = (SELECT COALESCE(SUM(total_interest),0) FROM loans WHERE client_id = p_client_id AND deleted_at IS NULL),
    last_payment_at = (SELECT MAX(created_at) FROM payments WHERE client_id = p_client_id AND status = 'paid'),
    total_paid      = (SELECT COALESCE(SUM(amount),0) FROM payments WHERE client_id = p_client_id AND status = 'paid'),
    balance         = (SELECT COALESCE(SUM(remaining_amount),0) FROM loans WHERE client_id = p_client_id AND status IN ('active','late','late_1_30','late_31_60','late_61_90') AND deleted_at IS NULL),
    trust_score     = v_score,
    trust_level     = CASE
      WHEN v_score >= 75 THEN 'high'
      WHEN v_score >= 40 THEN 'medium'
      ELSE 'low'
    END
  WHERE id = p_client_id;
END;
$$;

-- --- 2) RLS de payments separada (SELECT vs escritura) ---
DROP POLICY IF EXISTS "Users can manage payments on their loans" ON payments;
DROP POLICY IF EXISTS "Users can read payments on their loans or own payments" ON payments;
CREATE POLICY "Users can read payments on their loans or own payments"
  ON payments FOR SELECT
  USING (
    auth.uid() = payments.user_id
    OR EXISTS (SELECT 1 FROM loans WHERE loans.id = payments.loan_id AND loans.user_id = auth.uid())
  );
CREATE POLICY "Users can write payments on their loans"
  ON payments FOR ALL
  USING (EXISTS (SELECT 1 FROM loans WHERE loans.id = payments.loan_id AND loans.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM loans WHERE loans.id = payments.loan_id AND loans.user_id = auth.uid()));