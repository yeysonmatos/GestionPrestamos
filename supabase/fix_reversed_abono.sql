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
  loan_id UUID := '53bb4808-0004-45ef-98cc-c9e53e481d95';
  abono_paid NUMERIC;
  correct_principal NUMERIC;
  correct_interest NUMERIC;
  total_inst INTEGER := 3;
  inst_rec RECORD;
  is_last BOOLEAN;
BEGIN
  -- Calcular el total de abonos activos (no revertidos)
  SELECT COALESCE(SUM(amount), 0) INTO abono_paid
  FROM payments
  WHERE loan_id = loan_id
    AND type = 'capital_abono'
    AND status = 'paid';

  RAISE NOTICE 'Abonos activos: %', abono_paid;

  -- El capital correcto = amount original - abonos activos
  SELECT amount INTO correct_principal FROM loans WHERE id = loan_id;
  correct_principal := correct_principal - abono_paid;
  correct_interest := ROUND(correct_principal * 10.0 / 100.0, 2);

  RAISE NOTICE 'Capital correcto: %, Interés correcto: %', correct_principal, correct_interest;

  -- Actualizar las cuotas pendientes
  FOR inst_rec IN
    SELECT id, number FROM installments
    WHERE loan_id = loan_id
      AND status != 'paid'
    ORDER BY number
  LOOP
    is_last := (inst_rec.number = total_inst);

    UPDATE installments
    SET amount = CASE WHEN is_last THEN correct_interest + correct_principal ELSE correct_interest END,
        capital = CASE WHEN is_last THEN correct_principal ELSE 0 END,
        interest = correct_interest,
        balance = CASE WHEN is_last THEN 0 ELSE correct_principal END
    WHERE id = inst_rec.id;

    RAISE NOTICE '  Cuota #% actualizada', inst_rec.number;
  END LOOP;

  -- Actualizar el préstamo
  UPDATE loans
  SET remaining_amount = correct_principal,
      installment_amount = correct_interest,
      paid_amount = abono_paid,
      progress = CASE WHEN total_inst > 0 THEN ROUND((paid_installments::DECIMAL / total_inst) * 100) ELSE 0 END
  WHERE id = loan_id;

  RAISE NOTICE 'Préstamo actualizado: remaining=%, installment_amount=%, paid=%',
    correct_principal, correct_interest, abono_paid;

  RAISE NOTICE '✅ Reparación completada';
END $$;
