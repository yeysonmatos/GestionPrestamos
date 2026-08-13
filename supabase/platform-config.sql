-- ============================================================
-- CONFIGURACIÓN DE PAGO ADMINISTRADA POR EL ADMIN
-- Guarda los datos bancarios del cobrador (empresa que recibe la
-- transferencia de suscripción). Los clientes solo pueden LEER
-- este valor único; solo el admin puede modificarlo.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_name TEXT DEFAULT '',
  account_name TEXT DEFAULT '',
  account_number TEXT DEFAULT '',
  payment_phone TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer la config de pago
DROP POLICY IF EXISTS "Authenticated can read platform config" ON platform_config;
CREATE POLICY "Authenticated can read platform config"
  ON platform_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Solo admin puede escribir
DROP POLICY IF EXISTS "Only admin can modify platform config" ON platform_config;
CREATE POLICY "Only admin can modify platform config"
  ON platform_config FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Garantizar que exista una fila única por defecto
INSERT INTO platform_config (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;