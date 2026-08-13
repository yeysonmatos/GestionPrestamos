-- ============================================================
-- FIX: infinite recursion (42P17) en RLS de app_users/plans/
-- subscriptions/subscription_payments.
-- Causa: las policies usaban subconsultas inline a app_users
-- que disparaban recursión. Ahora usan public.is_admin()
-- (SECURITY DEFINER → omite RLS).
-- ============================================================

-- app_users
DROP POLICY IF EXISTS "Only admin can modify app_users" ON app_users;
CREATE POLICY "Only admin can modify app_users"
  ON app_users FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- plans
DROP POLICY IF EXISTS "Anyone can view active plans" ON plans;
CREATE POLICY "Anyone can view active plans"
  ON plans FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Only admin can modify plans" ON plans;
CREATE POLICY "Only admin can modify plans"
  ON plans FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- subscriptions
DROP POLICY IF EXISTS "Users can read own subscription" ON subscriptions;
CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Only admin can modify subscriptions" ON subscriptions;
CREATE POLICY "Only admin can modify subscriptions"
  ON subscriptions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- subscription_payments
DROP POLICY IF EXISTS "Only admin can view subscription payments" ON subscription_payments;
CREATE POLICY "Only admin can view subscription payments"
  ON subscription_payments FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Only admin can modify subscription payments" ON subscription_payments;
CREATE POLICY "Only admin can modify subscription payments"
  ON subscription_payments FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
