-- Upgrade de plan (Opción B): pago-por-plan-nuevo
-- Agrega target_plan_id a subscription_payments para que una solicitud de
-- pago pueda cambiar el plan del usuario al confirmarla.
ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS target_plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;