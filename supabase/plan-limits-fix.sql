-- Fix: enforce_client_limit usaba MAX(p.price = 0) → max(boolean) no existe en Postgres.
-- Causaba "function max(boolean) does not exist" al restaurar backups (INSERT en clients).
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