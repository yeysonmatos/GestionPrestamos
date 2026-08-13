-- ============================================================
-- PAGOS DE SUSCRIPCIÓN — solicitudes pendientes (manual mejorado)
-- Añade estado a subscription_payments y abre RLS a los clientes
-- para que puedan crear y ver sus propias solicitudes de pago.
-- ============================================================

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('pending', 'confirmed', 'rejected'));

-- --- RLS: el usuario gestiona sus propias solicitudes; admin lo controla todo ---

DROP POLICY IF EXISTS "Only admin can view subscription payments" ON subscription_payments;
DROP POLICY IF EXISTS "Only admin can modify subscription payments" ON subscription_payments;
DROP POLICY IF EXISTS "Users can read own subscription payments" ON subscription_payments;
DROP POLICY IF EXISTS "Users can insert own subscription payment requests" ON subscription_payments;
DROP POLICY IF EXISTS "Only admin can modify subscription payments" ON subscription_payments;
DROP POLICY IF EXISTS "Only admin can delete subscription payments" ON subscription_payments;

-- Cualquier usuario autenticado PUEDE leer sus propias solicitudes de pago
CREATE POLICY "Users can read own subscription payments"
  ON subscription_payments FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Cualquier usuario autenticado PUEDE insertar su propia solicitud de pago
CREATE POLICY "Users can insert own subscription payment requests"
  ON subscription_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Solo admin actualiza (confirmar/rechazar) o borra
CREATE POLICY "Only admin can modify subscription payments"
  ON subscription_payments FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admin can delete subscription payments"
  ON subscription_payments FOR DELETE
  USING (public.is_admin());