-- =============================================================
-- FIX: Restaurar cuotas después de reversión de abono al capital
-- 
-- Problema: Al revertir un abono al capital (capital_abono),
-- las cuotas pendientes NO se restauraron a sus valores originales.
-- Esto dejó el schedule con valores incorrectos.
--
-- Uso: Copia y pega esto en el SQL Editor del Dashboard de Supabase
-- =============================================================

DO $$
DECLARE
  loan_rec RECORD;
  inst_rec RECORD;
  days_in_period INTEGER;
  monthly_rate NUMERIC;
  periodic_rate NUMERIC;
  interest_per_period NUMERIC;
  original_principal NUMERIC;
  original_interest NUMERIC;
  original_capital NUMERIC;
  original_balance NUMERIC;
  original_amount NUMERIC;
  factor NUMERIC;
  french_installment NUMERIC;
  remaining_balance NUMERIC;
  inst_interest NUMERIC;
  inst_capital NUMERIC;
  is_last BOOLEAN;
  total_installments INTEGER;
BEGIN

  -- Recorrer todos los préstamos que tengan abonos al capital revertidos
  FOR loan_rec IN
    SELECT DISTINCT l.id, l.amount, l.interest_rate, l.installments,
           l.frequency, l.start_date, l.amortization_type
    FROM loans l
    WHERE EXISTS (
      SELECT 1 FROM payments p
      WHERE p.loan_id = l.id
        AND p.type = 'capital_abono'
        AND p.status = 'reversed'
    )
  LOOP
    RAISE NOTICE 'Procesando préstamo % (Monto: %, Tipo: %, Cuotas: %)',
      loan_rec.id, loan_rec.amount, loan_rec.amortization_type, loan_rec.installments;

    -- Calcular días del período según frecuencia
    days_in_period := CASE loan_rec.frequency
      WHEN 'daily' THEN 1
      WHEN 'weekly' THEN 7
      WHEN 'biweekly' THEN 14
      WHEN 'monthly' THEN 30
      ELSE 30
    END;

    monthly_rate := loan_rec.interest_rate / 100.0;
    periodic_rate := monthly_rate / 30.0 * days_in_period;
    original_principal := loan_rec.amount;
    total_installments := loan_rec.installments;

    IF loan_rec.amortization_type = 'interest_only' THEN
      -- === AMORTIZACIÓN SOLO INTERÉS ===
      interest_per_period := ROUND(original_principal * periodic_rate, 2);

      FOR inst_rec IN
        SELECT i.id, i.number FROM installments i
        WHERE i.loan_id = loan_rec.id
          AND i.status != 'paid'
        ORDER BY i.number
      LOOP
        is_last := (inst_rec.number = total_installments);

        IF is_last THEN
          original_amount := interest_per_period + original_principal;
          original_capital := original_principal;
          original_balance := 0;
        ELSE
          original_amount := interest_per_period;
          original_capital := 0;
          original_balance := original_principal;
        END IF;
        original_interest := interest_per_period;

        UPDATE installments
        SET amount = original_amount,
            capital = original_capital,
            interest = original_interest,
            balance = original_balance
        WHERE id = inst_rec.id;

        RAISE NOTICE '  Cuota #%: amount=%, capital=%, interest=%, balance=%',
          inst_rec.number, original_amount, original_capital, original_interest, original_balance;
      END LOOP;

    ELSE
      -- === AMORTIZACIÓN FRANCESA ===
      IF periodic_rate = 0 THEN
        RAISE NOTICE '  Tasa periódica es 0, saltando...';
        CONTINUE;
      END IF;

      factor := POWER(1 + periodic_rate, total_installments);
      french_installment := ROUND(original_principal * periodic_rate * factor / (factor - 1), 2);
      remaining_balance := original_principal;

      FOR inst_rec IN
        SELECT i.id, i.number FROM installments i
        WHERE i.loan_id = loan_rec.id
          AND i.status != 'paid'
        ORDER BY i.number
      LOOP
        is_last := (inst_rec.number = total_installments);

        inst_interest := ROUND(remaining_balance * periodic_rate, 2);
        inst_capital := ROUND(french_installment - inst_interest, 2);
        original_amount := ROUND(inst_interest + inst_capital, 2);
        remaining_balance := ROUND(remaining_balance - inst_capital, 2);

        IF is_last THEN
          remaining_balance := 0;
        END IF;

        IF remaining_balance < 0.005 THEN
          remaining_balance := 0;
        END IF;

        UPDATE installments
        SET amount = original_amount,
            capital = inst_capital,
            interest = inst_interest,
            balance = remaining_balance
        WHERE id = inst_rec.id;

        RAISE NOTICE '  Cuota #%: amount=%, capital=%, interest=%, balance=%',
          inst_rec.number, original_amount, inst_capital, inst_interest, remaining_balance;
      END LOOP;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ Reparación completada';
END $$;
