-- Limpieza completa de datos (conserva auth.users + settings por usuario)
BEGIN;

-- 1. Documentos (FK a clients y loans)
DELETE FROM documents;

-- 2. Pagos (FK a loans, installments, clients, auth.users)
DELETE FROM payments;

-- 3. Cuotas (FK a loans y clients)
DELETE FROM installments;

-- 4. Préstamos (FK a clients)
DELETE FROM loans;

-- 5. Clientes (FK a auth.users)
DELETE FROM clients;

-- 6. Resetear settings a valores por defecto (opcional, conserva fila por usuario)
UPDATE settings SET
  business_name = 'Mi Negocio',
  business_address = '',
  business_phone = '',
  business_email = '',
  currency = 'MXN',
  late_interest_rate = 0.5,
  loan_id_prefix = 'L-',
  notify_upcoming_days = 3,
  default_installments = 10,
  default_frequency = 'weekly',
  grace_days = 0,
  language = 'es',
  updated_at = NOW();

COMMIT;
