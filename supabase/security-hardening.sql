-- ============================================================
-- SECURITY HARDENING — Auditoría 4 + 8 (go-live bloqueantes)
-- 1. Guardas de autorización + REVOKE/GRANT en RPCs expuestos
-- 2. Bucket documents aislado por usuario
-- 3. subscription_payments.status default 'pending' + RLS endurecida
-- 4. Índice payments(user_id, status)
-- 5. Cron de limpieza de audit_logs activado
-- Idempotente. Vía scripts/exec-security-hardening.mjs
-- ============================================================

-- ------------------------------------------------------------
-- 1. reconcile_money(): añadir guarda de seguridad interna
--    (patrón de get_loan_stats) + revocar acceso público.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_money(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_errors JSONB := '[]'::JSONB;
  v_loan RECORD;
  v_pay RECORD;
  v_client RECORD;
  v_capital_paid DECIMAL;
  v_capital_pending DECIMAL;
  v_payment_check DECIMAL;
  v_balance_computed DECIMAL;
  v_balance_stored DECIMAL;
  v_open_ended INTEGER := 0;
  v_testable INTEGER := 0;
  v_pay_rows INTEGER := 0;
  v_clients_ok INTEGER := 0;
BEGIN
  -- Guarda de seguridad: solo el dueño de la cuenta, el rol postgres (cron/management)
  -- o un superusuario pueden ejecutarla. NULL bajo role service (API admin) es aceptado.
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
       AND current_user <> 'postgres'
       AND current_user <> 'service_role' THEN
      RETURN NULL;
    END IF;
  ELSIF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RETURN NULL;
  END IF;

  FOR v_loan IN
    SELECT l.*,
           (SELECT COALESCE(SUM(p.capital_amount), 0) FROM payments p
             WHERE p.loan_id = l.id AND p.status = 'paid' AND p.type <> 'interest_only') AS cap_paid
    FROM loans l
    WHERE (p_user_id IS NULL OR l.user_id = p_user_id)
      AND l.deleted_at IS NULL
      AND l.status IN ('active','late','late_1_30','late_31_60','late_61_90')
  LOOP
    v_testable := v_testable + 1;
    IF v_loan.open_ended THEN v_open_ended := v_open_ended + 1; CONTINUE; END IF;

    v_capital_paid := COALESCE(v_loan.cap_paid, 0);
    v_capital_pending := COALESCE(v_loan.remaining_amount, 0);
    v_capital_pending := GREATEST(0, v_loan.amount - v_capital_paid);

    IF ABS((v_capital_paid + v_capital_pending) - v_loan.amount) > 0.01 THEN
      v_errors := v_errors || jsonb_build_object(
        'type', 'capital_identity',
        'loan_id', v_loan.loan_id,
        'client_name', (SELECT name FROM clients WHERE id = v_loan.client_id),
        'amount', v_loan.amount,
        'capital_paid', v_capital_paid,
        'capital_pending', v_capital_pending,
        'diff', (v_capital_paid + v_capital_pending) - v_loan.amount
      );
    END IF;

    FOR v_pay IN
      SELECT * FROM payments
      WHERE loan_id = v_loan.id AND status = 'paid'
    LOOP
      v_pay_rows := v_pay_rows + 1;
      v_payment_check := COALESCE(v_pay.capital_amount, 0)
                       + COALESCE(v_pay.interest_amount, 0)
                       + COALESCE(v_pay.late_amount, 0);
      IF ABS((v_payment_check - v_pay.amount)) > 0.01 THEN
        v_errors := v_errors || jsonb_build_object(
          'type', 'payment_decomposition',
          'loan_id', v_loan.loan_id,
          'payment_id', v_pay.id,
          'amount', v_pay.amount,
          'decomposed', v_payment_check,
          'diff', v_payment_check - v_pay.amount
        );
      END IF;
    END LOOP;
  END LOOP;

  FOR v_client IN
    SELECT id, name, balance FROM clients
    WHERE p_user_id IS NULL OR user_id = p_user_id
  LOOP
    v_balance_computed := (SELECT COALESCE(SUM(remaining_amount), 0) FROM loans
                           WHERE client_id = v_client.id
                             AND status IN ('active','late','late_1_30','late_31_60','late_61_90')
                             AND deleted_at IS NULL);
    v_balance_stored := COALESCE(v_client.balance, 0);
    IF ABS(v_balance_computed - v_balance_stored) > 0.01 THEN
      v_errors := v_errors || jsonb_build_object(
        'type', 'client_balance_mismatch',
        'client_id', v_client.id,
        'client_name', v_client.name,
        'stored', v_balance_stored,
        'computed', v_balance_computed,
        'diff', v_balance_computed - v_balance_stored
      );
    ELSE
      v_clients_ok := v_clients_ok + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ran', true,
    'user_id', p_user_id,
    'testable_loans', v_testable,
    'open_ended_skipped', v_open_ended,
    'payment_rows', v_pay_rows,
    'clients_checked', v_clients_ok,
    'error_count', jsonb_array_length(v_errors),
    'errors', v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_money(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_money(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_money(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_money(UUID) TO service_role;

-- ------------------------------------------------------------
-- 2. update_all_loan_statuses(): guarda (solo sistema/cron) + revocar público
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_all_loan_statuses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_loan RECORD;
  v_max_late_days INTEGER;
  v_new_status TEXT;
  v_updated_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Función reservada al sistema';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
     AND current_user <> 'postgres'
     AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Función reservada al sistema';
  END IF;

  FOR v_loan IN
    SELECT id FROM loans
    WHERE status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
  LOOP
    SELECT COALESCE(MAX(GREATEST(0, public.today_rd() - due_date)), 0)
    INTO v_max_late_days
    FROM installments
    WHERE loan_id = v_loan.id
    AND status IN ('pending', 'partial', 'late');

    IF v_max_late_days <= 0 THEN
      CONTINUE;
    END IF;

    IF v_max_late_days <= 30 THEN
      v_new_status := 'late_1_30';
    ELSIF v_max_late_days <= 60 THEN
      v_new_status := 'late_31_60';
    ELSE
      v_new_status := 'late_61_90';
    END IF;

    UPDATE loans
    SET status = v_new_status,
        late_days = v_max_late_days
    WHERE id = v_loan.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.update_all_loan_statuses() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_all_loan_statuses() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_all_loan_statuses() TO service_role;

-- ------------------------------------------------------------
-- 3. process_installment_payment / process_cascade_payment:
--    revocar de anon. (La guarda NULL-segura se aplica vía
--    schema.sql / cascade-guard.sql / security-guards.sql.)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.process_installment_payment(
  UUID, UUID, UUID, DECIMAL, BOOLEAN, DATE, TEXT, TEXT, DECIMAL, INTEGER
) FROM anon;
REVOKE ALL ON FUNCTION public.process_cascade_payment(
  UUID, UUID, DECIMAL, BOOLEAN, DATE, TEXT, TEXT, DECIMAL, INTEGER
) FROM anon;

-- ------------------------------------------------------------
-- 4. update_client_stats: guarda NULL (anon) + revocar anon.
--    CUERPO COMPLETO restaurado (client-status-fix2.sql): el harden de esta
--    función debe mantener status/metricas, no solo trust.
-- ------------------------------------------------------------
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
       AND current_user <> 'postgres'
       AND current_user <> 'service_role' THEN
      RETURN;
    END IF;
  ELSIF auth.uid() <> (SELECT user_id FROM clients WHERE id = p_client_id) THEN
    RETURN;
  END IF;

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
  IF v_late_loans > 0 THEN v_score := v_score - 10; END IF;

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
    trust_score     = GREATEST(0, v_score),
    trust_level     = CASE
      WHEN v_score >= 75 THEN 'high'
      WHEN v_score >= 40 THEN 'medium'
      ELSE 'low'
    END
  WHERE id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_client_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_client_stats(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_client_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_stats(UUID) TO service_role;

-- ------------------------------------------------------------
-- 5. Funciones puras de apoyo: revocar anon (inofensivas pero innecesarias)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.calc_late_days(DATE, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.calc_late_amount(NUMERIC, INTEGER, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;

-- ------------------------------------------------------------
-- 6. Bucket documents: aislar por prefijo de usuario.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "users_read_documents" ON storage.objects;
CREATE POLICY "users_read_documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text
  );

DROP POLICY IF EXISTS "users_insert_documents" ON storage.objects;
CREATE POLICY "users_insert_documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text
  );

DROP POLICY IF EXISTS "users_delete_documents" ON storage.objects;
CREATE POLICY "users_delete_documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text
  );

-- ------------------------------------------------------------
-- 7. subscription_payments: default 'pending' + RLS INSERT endurecida
-- ------------------------------------------------------------
ALTER TABLE subscription_payments ALTER COLUMN status SET DEFAULT 'pending';

DROP POLICY IF EXISTS "Users can insert own subscription payment requests" ON subscription_payments;
CREATE POLICY "Users can insert own subscription payment requests"
  ON subscription_payments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND amount > 0
  );

-- ------------------------------------------------------------
-- 8. Índice payments(user_id, status) para queries hot
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);

-- ------------------------------------------------------------
-- 9. Cron semanal de limpieza de audit_logs (> 1 año) activado
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('cleanup-audit-logs-weekly', '0 8 * * 0',
  'DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL ''1 year'';');