-- =============================================================
-- FIX V2: Reparar remaining_amount y cuotas del préstamo L-100001
-- 
-- Causa raíz: handlePayInterest no actualizaba remaining_amount,
-- lo que infló remaining_amount al revertir pagos.
--
-- Uso: Copia y pega en el SQL Editor del Dashboard de Supabase
-- =============================================================

DO $$
DECLARE
  v_loan_id UUID := '53bb4808-0004-45ef-98cc-c9e53e481d95';
  v_abono_paid NUMERIC;
  v_correct_principal NUMERIC;
  v_correct_interest NUMERIC;
  v_total_inst INTEGER := 3;
  v_inst_rec RECORD;
  v_is_last BOOLEAN;
BEGIN
  SELECT COALESCE(SUM(p.amount), 0) INTO v_abono_paid
  FROM payments p
  WHERE p.loan_id = v_loan_id
    AND p.type = 'capital_abono'
    AND p.status = 'paid';

  RAISE NOTICE 'Abonos activos: %', v_abono_paid;

  SELECT l.amount INTO v_correct_principal FROM loans l WHERE l.id = v_loan_id;
  v_correct_principal := v_correct_principal - v_abono_paid;
  v_correct_interest := ROUND(v_correct_principal * 10.0 / 100.0, 2);

  RAISE NOTICE 'Capital correcto: %, Interés correcto: %', v_correct_principal, v_correct_interest;

  FOR v_inst_rec IN
    SELECT i.id, i.number FROM installments i
    WHERE i.loan_id = v_loan_id
      AND i.status != 'paid'
    ORDER BY i.number
  LOOP
    v_is_last := (v_inst_rec.number = v_total_inst);

    UPDATE installments
    SET amount = CASE WHEN v_is_last THEN v_correct_interest + v_correct_principal ELSE v_correct_interest END,
        capital = CASE WHEN v_is_last THEN v_correct_principal ELSE 0 END,
        interest = v_correct_interest,
        balance = CASE WHEN v_is_last THEN 0 ELSE v_correct_principal END
    WHERE id = v_inst_rec.id;

    RAISE NOTICE '  Cuota #% actualizada', v_inst_rec.number;
  END LOOP;

  UPDATE loans l
  SET remaining_amount = v_correct_principal,
      installment_amount = v_correct_interest,
      paid_amount = v_abono_paid,
      progress = CASE WHEN v_total_inst > 0 THEN ROUND((l.paid_installments::DECIMAL / v_total_inst) * 100) ELSE 0 END
  WHERE l.id = v_loan_id;

  RAISE NOTICE 'Préstamo actualizado: remaining=%, installment_amount=%, paid=%',
    v_correct_principal, v_correct_interest, v_abono_paid;

  RAISE NOTICE '✅ Reparación completada';
END $$;
