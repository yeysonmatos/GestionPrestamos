-- ============================================================
-- PANEL DE ADMINISTRACIÓN — SaaS multi-tenant
-- Tablas: app_users, plans, subscriptions, subscription_payments
-- RLS por rol + RPC is_admin() + handle_new_user extendido
-- ============================================================

-- USUARIOS DE LA PLATAFORMA (rol + estado de acceso)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer su propia fila
DROP POLICY IF EXISTS "Users can read own app_user row" ON app_users;
CREATE POLICY "Users can read own app_user row"
  ON app_users FOR SELECT
  USING (auth.uid() = id);

-- Solo admin puede insertar/actualizar/eliminar filas de app_users
DROP POLICY IF EXISTS "Only admin can modify app_users" ON app_users;
CREATE POLICY "Only admin can modify app_users"
  ON app_users FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status);

-- PLANES DE SUSCRIPCIÓN
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'DOP',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  description TEXT,
  features JSONB DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede ver planes activos
DROP POLICY IF EXISTS "Anyone can view active plans" ON plans;
CREATE POLICY "Anyone can view active plans"
  ON plans FOR SELECT
  USING (is_active = true OR public.is_admin());

-- Solo admin puede escribir planes
DROP POLICY IF EXISTS "Only admin can modify plans" ON plans;
CREATE POLICY "Only admin can modify plans"
  ON plans FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- SUSCRIPCIONES (una activa por usuario a la vez en uso normal)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuario puede leer su propia suscripción; admin ve todas
DROP POLICY IF EXISTS "Users can read own subscription" ON subscriptions;
CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Solo admin modifica suscripciones
DROP POLICY IF EXISTS "Only admin can modify subscriptions" ON subscriptions;
CREATE POLICY "Only admin can modify subscriptions"
  ON subscriptions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_ends_at ON subscriptions(ends_at);

-- PAGOS DE SUSCRIPCIÓN (mensualidades registradas por el admin)
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'transfer', 'deposit', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- Solo admin ve/gestiona pagos de suscripción
DROP POLICY IF EXISTS "Only admin can view subscription payments" ON subscription_payments;
CREATE POLICY "Only admin can view subscription payments"
  ON subscription_payments FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Only admin can modify subscription payments" ON subscription_payments;
CREATE POLICY "Only admin can modify subscription payments"
  ON subscription_payments FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_sub_payments_sub_id ON subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_user_id ON subscription_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_date ON subscription_payments(payment_date);

-- ============================================================
-- RPC is_admin() — guard de seguridad para middleware y API
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================
-- handle_new_user extendido: crea app_users + suscripción trial
-- Reemplaza la versión anterior (settings + nuevo)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO settings (user_id, onboarding_completed)
  VALUES (NEW.id, false);

  INSERT INTO app_users (id, role, display_name, status)
  VALUES (NEW.id, 'client', COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), 'active');

  INSERT INTO subscriptions (user_id, plan_id, status, starts_at, ends_at)
  SELECT
    NEW.id,
    p.id,
    'trial',
    NOW(),
    NOW() + INTERVAL '14 days'
  FROM plans p
  WHERE p.name ILIKE 'Trial' OR p.name ILIKE 'Prueba'
  LIMIT 1;

  RETURN NEW;
END;
$$;

-- ============================================================
-- SEED — marcar al dueño como ADMIN (ejecutar una vez con tu user id)
-- ============================================================
-- INSERT INTO app_users (id, role, display_name, status)
-- SELECT id, 'admin', email, 'active' FROM auth.users WHERE email = 'tu-email@correo.com'
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';
--
-- Planes iniciales (mercado dominicano, RD$):
-- INSERT INTO plans (name, price, currency, billing_cycle, description, features) VALUES
--   ('Trial', 0, 'DOP', 'monthly', 'Prueba de 30 días', '["Acceso completo por 30 días"]'),
--   ('Básico', 899, 'DOP', 'monthly', 'Para prestamistas que inician', '["Hasta 30 clientes", "Préstamos sin límite", "Soporte por email"]'),
--   ('Pro', 1499, 'DOP', 'monthly', 'Para negocios en crecimiento', '["Clientes ilimitados", "Reportes avanzados", "Soporte prioritario"]');
