-- ============================================================
-- PLAN LIMITS — enforcement de límites por plan (features reales)
-- 1) plans.max_clients (NULL = sin límite)
-- 2) Trigger en clients: bloquea insertar si el plan lo impide
-- ============================================================

-- Columna estructural en planes (NULL = ilimitado)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_clients INTEGER;

-- Semilla: Trial libre (sin límite), Básico = 30, Pro = ilimitado
UPDATE plans SET max_clients = NULL  WHERE name ILIKE 'Trial'   OR name ILIKE 'Prueba';
UPDATE plans SET max_clients = 30    WHERE name ILIKE 'Básico' OR name ILIKE 'Basico' OR name ILIKE 'B%C3%A1sico';
UPDATE plans SET max_clients = NULL  WHERE name ILIKE 'Pro';

-- ============================================================
-- Trigger: enforce el límite de clientes en cada INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_client_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_max_clients INTEGER;
  v_count INTEGER;
  v_plan_name TEXT;
  v_is_free BOOLEAN;
BEGIN
  -- Los admins y los usuarios sin suscripción quedan exentos
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT MAX(p.max_clients), BOOL_OR(p.price = 0), MAX(p.name)
  INTO v_max_clients, v_is_free, v_plan_name
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.user_id = NEW.user_id
    AND s.status IN ('active', 'trial');

  -- Sin suscripción activa o plan gratuito (Trial) → sin límite
  IF v_max_clients IS NULL OR v_max_clients <= 0 OR v_is_free IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM clients
  WHERE user_id = NEW.user_id;

  IF v_count >= v_max_clients THEN
    RAISE EXCEPTION
      'Has alcanzado el límite de clientes de tu plan (% de %). Mejora tu plan para añadir más.',
      v_max_clients, v_count;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_client_limit ON clients;
CREATE TRIGGER trg_enforce_client_limit
  BEFORE INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_client_limit();