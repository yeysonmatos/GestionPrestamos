-- Auditoría 6 (Fase C): reconciliación contable en BD.
-- public.reconcile_money(p_user_id UUID DEFAULT NULL)
--   Verifica invariantes monetarias por cuenta:
--     1. Préstanos activos: amount = Σ capital pagado + capital pendiente
--        (identidad Prestado = Recuperado + Pendiente, excluyendo archivados).
--     2. payments.amount = Σ (capital + interés + mora) por pago.
--     3. El balance del cliente (excluyendo open-ended) == Σ remaining de sus
--        préstamos activos/morosos no archivados (misma fórmula de update_client_stats).
--   Devuelve jsonb: { ran, user_id, errors[], testable_loans, payment_rows,
--                      clients_ok, open_ended_count }.
--   Con p_user_id NULL (rol superuser/postgres vía management) recorre todas las
--   cuentas; con un user_id valida solo esa cuenta.
-- Idempotente. Vía scripts/exec-audit-reconcile.mjs

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

    -- 1) Identidad Prestado = Recuperado + Pendiente, con tolerancia de redondeo
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

    -- 2) payments.amount == Σ(capital + interés + mora) por pago
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

  -- 3) clients.balance == Σ remaining (misma fórmula update_client_stats)
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