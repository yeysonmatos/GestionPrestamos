-- ============================================================
-- SEED: Simulación real de un prestamista independiente
-- Crea: 1 usuario + 2 clientes + 2 préstamos + operaciones
-- Ejecutar TODO en SQL Editor de Supabase (seleccionar todo y Run)
-- ============================================================

-- PARTE 1: Crear usuario auth (FUERA del DO block para evitar restricciones)
DELETE FROM auth.users WHERE email = 'demo@prestamista.com';

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmation_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token,
  email_change, email_change_token_new, email_change_token_current
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  'demo@prestamista.com',
  '$2b$10$Vqyv7YHMEGl9RcN8Ikaxp.REr05vpqLOKVYnv6ccOp2eHXFUDbrg.',
  NOW(), NOW(), NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(), NOW(), '',
  '', '', ''
);

-- PARTE 2: Validar que el usuario se creó
DO $$
DECLARE
  v_user_id UUID;
  v_check INTEGER;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'demo@prestamista.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ERROR: No se pudo crear el usuario auth';
  END IF;

  RAISE NOTICE 'Usuario creado OK: %', v_user_id;
END $$;

-- PARTE 3: Datos del seed
DO $$
DECLARE
  v_user_id UUID;
  v_client_juan UUID;
  v_client_maria UUID;
  v_loan_french UUID;
  v_loan_interest UUID;
  v_inst1 UUID;
  v_inst2 UUID;
BEGIN

  SELECT id INTO v_user_id FROM auth.users WHERE email = 'demo@prestamista.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el usuario demo@prestamista.com';
  END IF;

  -- Settings
  INSERT INTO public.settings (user_id, business_name, business_phone, currency, late_interest_rate, loan_id_prefix, grace_days, default_frequency, default_installments)
  VALUES (v_user_id, 'Financiera Demo', '809-555-0000', 'DOP', 0.5, 'L-', 0, 'monthly', 6)
  ON CONFLICT (user_id) DO UPDATE SET
    business_name = 'Financiera Demo', late_interest_rate = 0.5, grace_days = 0;

  -- Limpiar datos previos
  DELETE FROM public.payments p USING public.loans l WHERE p.loan_id = l.id AND l.user_id = v_user_id;
  DELETE FROM public.installments i USING public.loans l WHERE i.loan_id = l.id AND l.user_id = v_user_id;
  DELETE FROM public.loans WHERE user_id = v_user_id;
  DELETE FROM public.clients WHERE user_id = v_user_id;

  -- CLIENTES
  INSERT INTO public.clients (user_id, name, first_name, last_name, phone, document, email, provincia, municipio, sector, calle, numero)
  VALUES (v_user_id, 'Juan Pérez', 'Juan', 'Pérez', '809-555-0101', '001-1234567-8', 'juan@email.com', 'Santo Domingo', 'Distrito Nacional', 'Ensanche Quisqueya', 'Calle Principal', '42')
  RETURNING id INTO v_client_juan;

  INSERT INTO public.clients (user_id, name, first_name, last_name, phone, document, email, provincia, municipio, sector, calle, numero)
  VALUES (v_user_id, 'María García', 'María', 'García', '809-555-0102', '001-2345678-9', 'maria@email.com', 'Santo Domingo', 'Santo Domingo Este', 'Los Mina', 'Calle Secundaria', '15')
  RETURNING id INTO v_client_maria;

  -- PRÉSTAMO FRANCÉS
  INSERT INTO public.loans (loan_id, user_id, client_id, amount, interest_type, interest_rate, total_amount, total_interest, installment_amount, installments, paid_installments, paid_amount, remaining_amount, progress, frequency, start_date, first_payment_date, end_date, amortization_type, open_ended, status, late_interest_rate)
  VALUES ('L-FR-001', v_user_id, v_client_juan, 50000, 'percentage', 4, 57228.57, 7228.57, 9538.10, 6, 0, 0, 50000, 0, 'monthly', '2026-04-01', '2026-05-01', '2026-10-01', 'french', false, 'active', 0.5)
  RETURNING id INTO v_loan_french;

  INSERT INTO public.installments (loan_id, client_id, number, amount, capital, interest, balance, due_date, status, paid_amount, paid_at, late_days, late_amount)
  VALUES
    (v_loan_french, v_client_juan, 1, 9538.10, 7538.10, 2000.00, 42461.90, '2026-05-01', 'paid',   9522.81, '2026-05-02', 1, 47.61),
    (v_loan_french, v_client_juan, 2, 9538.10, 7839.63, 1698.47, 34622.27, '2026-06-01', 'pending', 0, NULL, 0, 0),
    (v_loan_french, v_client_juan, 3, 9538.10, 8153.18, 1384.92, 26469.09, '2026-07-01', 'late',   0, NULL, 19, 953.81),
    (v_loan_french, v_client_juan, 4, 9538.10, 8479.31, 1058.79, 17989.78, '2026-08-01', 'pending', 0, NULL, 0, 0),
    (v_loan_french, v_client_juan, 5, 9538.10, 8818.51, 719.59,  9171.27,  '2026-09-01', 'pending', 0, NULL, 0, 0),
    (v_loan_french, v_client_juan, 6, 9538.10, 9171.27, 366.83,  0,         '2026-10-01', 'pending', 0, NULL, 0, 0);

  SELECT id INTO v_inst1 FROM public.installments WHERE loan_id = v_loan_french AND number = 1;
  SELECT id INTO v_inst2 FROM public.installments WHERE loan_id = v_loan_french AND number = 2;

  -- PAGOS + REVERSOS + ABONO (francés)
  INSERT INTO public.payments (loan_id, installment_id, client_id, user_id, amount, capital_amount, interest_amount, late_amount, type, payment_date, method, notes, status)
  VALUES (v_loan_french, v_inst1, v_client_juan, v_user_id, 9570.42, 7538.10, 2000.00, 47.61, 'installment', '2026-05-02', 'cash', 'Cuota 1 pagada con 1 dia de retraso', 'paid');

  INSERT INTO public.payments (loan_id, installment_id, client_id, user_id, amount, capital_amount, interest_amount, type, payment_date, method, notes, status)
  VALUES (v_loan_french, v_inst2, v_client_juan, v_user_id, 9538.10, 7839.63, 1698.47, 'installment', '2026-06-01', 'transfer', 'Cuota 2 pagada a tiempo', 'paid');

  INSERT INTO public.payments (loan_id, installment_id, client_id, user_id, amount, capital_amount, interest_amount, type, payment_date, method, notes, status)
  VALUES (v_loan_french, v_inst2, v_client_juan, v_user_id, 9538.10, 7839.63, 1698.47, 'installment', '2026-07-15', 'cash', 'REVERSION: cuota 2', 'reversed');

  UPDATE public.installments SET status = 'pending', paid_amount = 0, paid_at = NULL, paid_late_amount = 0 WHERE id = v_inst2;

  INSERT INTO public.payments (loan_id, client_id, user_id, amount, capital_amount, interest_amount, type, payment_date, method, notes, status)
  VALUES (v_loan_french, v_client_juan, v_user_id, 10000, 10000, 0, 'capital_abono', '2026-07-18', 'transfer', 'Abono voluntario a capital', 'paid');

  UPDATE public.loans SET paid_amount = 19522.81, remaining_amount = 32461.90, paid_installments = 1 WHERE id = v_loan_french;

  -- PRÉSTAMO INTEREST-ONLY
  INSERT INTO public.loans (loan_id, user_id, client_id, amount, interest_type, interest_rate, total_amount, total_interest, installment_amount, installments, paid_installments, paid_amount, remaining_amount, progress, frequency, start_date, first_payment_date, payment_day, amortization_type, open_ended, status, late_interest_rate)
  VALUES ('L-IO-001', v_user_id, v_client_maria, 100000, 'percentage', 3, 100000, 3000, 3000, 0, 0, 0, 100000, 0, 'monthly', '2026-04-01', '2026-05-01', 1, 'interest_only', true, 'active', 0.5)
  RETURNING id INTO v_loan_interest;

  INSERT INTO public.payments (loan_id, client_id, user_id, amount, capital_amount, interest_amount, type, payment_date, method, notes, status)
  VALUES (v_loan_interest, v_client_maria, v_user_id, 3000, 0, 3000, 'installment', '2026-05-01', 'cash', 'Interes mes 1 pagado a tiempo', 'paid');

  INSERT INTO public.payments (loan_id, client_id, user_id, amount, capital_amount, interest_amount, late_amount, type, payment_date, method, notes, status)
  VALUES (v_loan_interest, v_client_maria, v_user_id, 3075, 0, 3000, 75, 'installment', '2026-06-05', 'cash', 'Interes mes 2 pagado con 5 dias de retraso', 'paid');

  INSERT INTO public.payments (loan_id, client_id, user_id, amount, capital_amount, interest_amount, type, payment_date, method, notes, status)
  VALUES (v_loan_interest, v_client_maria, v_user_id, 20000, 20000, 0, 'capital_abono', '2026-06-15', 'transfer', 'Abono a capital reduce base a 80,000', 'paid');

  UPDATE public.loans SET paid_amount = 26075, remaining_amount = 80000, installment_amount = 2400 WHERE id = v_loan_interest;

  INSERT INTO public.payments (loan_id, client_id, user_id, amount, capital_amount, interest_amount, late_amount, type, payment_date, method, notes, status)
  VALUES (v_loan_interest, v_client_maria, v_user_id, 3075, 0, 3000, 75, 'installment', '2026-07-10', 'cash', 'REVERSION: interes mes 2', 'reversed');

  UPDATE public.loans SET paid_amount = 23000 WHERE id = v_loan_interest;

  INSERT INTO public.payments (loan_id, client_id, user_id, amount, capital_amount, interest_amount, type, payment_date, method, notes, status)
  VALUES (v_loan_interest, v_client_maria, v_user_id, 80000, 80000, 0, 'liquidation', '2026-07-20', 'transfer', 'Liquidacion total del prestamo', 'paid');

  UPDATE public.loans SET status = 'paid', paid_amount = 103000, remaining_amount = 0, progress = 100 WHERE id = v_loan_interest;

  -- Actualizar estadísticas
  PERFORM public.update_client_stats(v_client_juan);
  PERFORM public.update_client_stats(v_client_maria);

  RAISE NOTICE 'SEED COMPLETADO EXITOSAMENTE';
  RAISE NOTICE 'Email: demo@prestamista.com | Pass: Demo1234!';

END $$;
