-- AVISO: los precios (899/1499) siguen vigentes, pero el trial de 30 días
-- de la función handle_new_user quedó REVERTIDO a 14 días por trial-14-days.sql
-- (decisión 01/09/2026).
-- Precios: Básico 899, Pro 1499 (RD$)
UPDATE plans SET price = 899 WHERE name = 'Básico';
UPDATE plans SET price = 1499 WHERE name = 'Pro';

-- Trial: 30 días de acceso completo
UPDATE plans SET description = 'Prueba de 30 días' WHERE name = 'Trial' AND description ILIKE '%14%';
UPDATE plans SET features = '["Acceso completo por 30 días"]' WHERE name = 'Trial';

-- Básico: texto coherente con max_clients = 30
UPDATE plans SET features = '["Hasta 30 clientes","Préstamos sin límite","Soporte por email"]' WHERE name = 'Básico';

-- handle_new_user: trial de 30 días
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
    NOW() + INTERVAL '30 days'
  FROM plans p
  WHERE p.name ILIKE 'Trial' OR p.name ILIKE 'Prueba'
  LIMIT 1;

  RETURN NEW;
END;
$$;
