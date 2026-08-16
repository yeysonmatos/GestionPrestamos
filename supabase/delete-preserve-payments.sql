-- Eliminación de préstamos SIN perder pagos.
-- 1) payments.loan_id pasa de ON DELETE CASCADE a ON DELETE SET NULL (y nullable).
-- 2) La RLS de payments se amplía para permitir acceso por user_id (pagos huérfanos).
-- 3) update_client_stats calcula "total_paid" desde payments en vez de loans,
--    para que lo cobrado sobreviva al borrado del préstamo.
-- Idempotente. Aplicar vía exec-delete-preserve-payments.mjs

-- --- 1) FK payments.loan_id: CASCADE -> SET NULL + nullable ---
ALTER TABLE payments ALTER COLUMN loan_id DROP NOT NULL;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_loan_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_loan_id_fkey
  FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL;

-- --- 2) RLS de payments: acceso por dueño (user_id) o préstamo existente ---
--    Lectura: pagos propios (user_id) u préstamo propio (sobrevive al borrado del préstamo).
--    Escritura: solo si el préstamo es propio (un pago huérfano no se puede modificar ni reasignar).
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

-- --- 3) update_client_stats: total_paid desde payments (capital cobrado) ---
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
                        AND i.due_date < public.today_rd()
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