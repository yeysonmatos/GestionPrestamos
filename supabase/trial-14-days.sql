-- Trial de vuelta a 14 días.
-- El 30 de agosto de 2026 se aplicó plan-updates.sql (trial de 30 días),
-- pero el texto del plan quedó en 14. Decisión del 01/09/2026: los trials
-- nuevos vuelven a durar 14 días (el texto ya era 'Prueba de 14 días').
-- Las suscripciones ya otorgadas (ej. Bessi, 30 días) conservan su vencimiento.
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