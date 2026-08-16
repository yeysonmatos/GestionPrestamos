-- Estado activo/inactivo automático del cliente + recalculo de todos los clientes
-- 1) update_client_stats marca clients.status = 'active' si el cliente tiene
--    préstamos en curso (active/late/late_1_30/late_31_60/late_61_90, no archivados)
--    y 'inactive' si no tiene ninguno. El balance NO cambia (sigue siendo lo que
--    resta por cobrar, incluyendo el interés programado).
-- 2) El cron 'recalc-client-stats-daily' pasa a recalcular TODOS los clientes
--    (antes solo los que tenían préstamos activos, por lo que los que debían
--    "apagarse" nunca se reevaluaban).
-- 3) Backfill: recalcula y flipea el estado de todos los clientes existentes.
-- Idempotente. Vía exec-client-status-auto.mjs

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
  --  conectado como postgres) puede recalcular sus estadísticas. Evita que un usuario
  --  altere clientes ajenos.
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

-- El cron diario debe reevaluar TODOS los clientes (para que los que se quedaron
-- sin préstamos activos pasen a 'inactive' incluso si no hubo evento en tiempo real).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recalc-client-stats-daily') THEN
    PERFORM cron.unschedule('recalc-client-stats-daily');
  END IF;
END $$;
SELECT cron.schedule('recalc-client-stats-daily', '0 9 * * *', 'SELECT public.update_client_stats(id) FROM clients;');

-- Backfill: recalcula y flipea el estado de todos los clientes existentes
SELECT public.update_client_stats(id) FROM clients;