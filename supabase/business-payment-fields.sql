-- Campos de pago del negocio (para transferencias de suscripción)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS account_name TEXT DEFAULT '';
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS account_number TEXT DEFAULT '';