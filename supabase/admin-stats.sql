-- ============================================================
-- AGREGACIÓN ADMIN — métricas computadas en SQL (no en JS)
-- Reemplaza la lógica de src/app/api/admin/stats/route.ts y el
-- listado de usuarios (src/app/api/admin/users/route.ts) que
-- cargaban tablas completas y agregaban en el cliente.
-- ============================================================

-- Devuelve todas las métricas del panel admin en una sola llamada.
-- SECURITY DEFINER + is_admin() para proteger el acceso.
CREATE OR REPLACE FUNCTION public.admin_usage_stats(p_from_month TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total_clients INTEGER;
  v_paid_users INTEGER;
  v_conversion INTEGER;
  v_blocked INTEGER;
  v_trial INTEGER;
  v_active INTEGER;
  v_expired INTEGER;
  v_revenue JSONB;
  v_per_plan JSONB;
  v_mrr NUMERIC;
  v_total_collected NUMERIC;
  v_recent_payments JSONB;
BEGIN
  -- Nota: este RPC se ejecuta con el cliente service_role (api/admin/*),
  -- por lo que NO se usa is_admin() aquí (auth.uid() es NULL bajo service_role
  -- y devolvería 'false'). El acceso se protege abajo con REVOKE/GRANT a
  -- service_role únicamente; el requireAdminApi de la ruta ya valida al user.

  SELECT COUNT(*) INTO v_total_clients FROM app_users WHERE role = 'client';
  SELECT COUNT(*) INTO v_blocked FROM app_users WHERE role = 'client' AND status = 'blocked';

  -- Usuarios que pagaron al menos una vez (confirmados), sin depender de la ventana de meses
  SELECT COUNT(DISTINCT user_id) INTO v_paid_users
  FROM subscription_payments WHERE status = 'confirmed';

  v_conversion := CASE WHEN v_total_clients > 0 THEN ROUND(v_paid_users::numeric / v_total_clients * 100)::INTEGER ELSE 0 END;

  -- Suscripción más reciente por usuario
  WITH latest_sub AS (
    SELECT DISTINCT ON (user_id) user_id, plan_id, status
    FROM subscriptions
    ORDER BY user_id, created_at DESC
  )
  SELECT
    (SELECT COUNT(*) FROM latest_sub WHERE status = 'trial'),
    (SELECT COUNT(*) FROM latest_sub WHERE status = 'active'),
    (SELECT COUNT(*) FROM latest_sub WHERE status IN ('expired', 'cancelled'))
  INTO v_trial, v_active, v_expired;

  -- Ingresos confirmados por mes (desde p_from_month si aplica)
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('month', month, 'income', income) ORDER BY month),
    '[]'::jsonb
  ) INTO v_revenue
  FROM (
    SELECT to_char(payment_date, 'YYYY-MM') AS month, SUM(amount)::numeric AS income
    FROM subscription_payments
    WHERE status = 'confirmed'
      AND (p_from_month IS NULL OR payment_date >= p_from_month::date)
    GROUP BY 1
  ) t;

  -- Usuarios por plan (suscripción más reciente)
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('plan_id', plan_id, 'name', name, 'count', count) ORDER BY count DESC),
    '[]'::jsonb
  ) INTO v_per_plan
  FROM (
    SELECT latest.plan_id, p.name, COUNT(*) AS count
    FROM (
      SELECT DISTINCT ON (user_id) plan_id
      FROM subscriptions
      ORDER BY user_id, created_at DESC
    ) latest
    JOIN plans p ON p.id = latest.plan_id
    GROUP BY latest.plan_id, p.name
  ) t;

  -- MRR: suma de precios de suscripciones activas pagadas (anual → /12)
  SELECT COALESCE(SUM(
    CASE WHEN p.billing_cycle = 'yearly' THEN p.price / 12 ELSE p.price END
  ), 0) INTO v_mrr
  FROM (
    SELECT DISTINCT ON (s.user_id) s.plan_id
    FROM subscriptions s
    WHERE s.status = 'active'
    ORDER BY s.user_id, s.created_at DESC
  ) latest
  JOIN plans p ON p.id = latest.plan_id
  WHERE p.price > 0;

  -- Total cobrado (todos los confirmados, histórico)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_collected
  FROM subscription_payments WHERE status = 'confirmed';

  -- Últimos 8 cobros con nombre de usuario
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', p.id,
      'user_id', p.user_id,
      'user_label', COALESCE(u.display_name, '—'),
      'amount', p.amount,
      'payment_date', p.payment_date,
      'method', p.method
    ) ORDER BY p.payment_date DESC),
    '[]'::jsonb
  ) INTO v_recent_payments
  FROM (
    SELECT * FROM subscription_payments WHERE status = 'confirmed' ORDER BY payment_date DESC LIMIT 8
  ) p
  LEFT JOIN app_users u ON u.id = p.user_id;

  RETURN jsonb_build_object(
    'revenue_by_month', COALESCE(v_revenue, '[]'::jsonb),
    'users_per_plan', COALESCE(v_per_plan, '[]'::jsonb),
    'conversion_rate', v_conversion,
    'trial_count', v_trial,
    'active_count', v_active,
    'expired_count', v_expired,
    'blocked_count', v_blocked,
    'total_clients', v_total_clients,
    'paid_users', v_paid_users,
    'mrr', v_mrr,
    'total_collected', v_total_collected,
    'recent_payments', COALESCE(v_recent_payments, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_usage_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_usage_stats(text) TO service_role;

-- ============================================================
-- MÉTRICAS DE USO POR USUARIO (listado de usuarios)
-- Agrega en SQL el conteo de préstamos/clientes/pagos por usuario
-- en lugar de cargar las tablas completas en el cliente.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_usage_by_user()
RETURNS TABLE (
  user_id uuid,
  loans_count bigint,
  clients_count bigint,
  payments_count bigint,
  last_activity_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    u.id AS user_id,
    COALESCE(l.cnt, 0)::bigint AS loans_count,
    COALESCE(c.cnt, 0)::bigint AS clients_count,
    COALESCE(p.cnt, 0)::bigint AS payments_count,
    CASE
      WHEN l.updated_at IS NOT NULL AND p.payment_date IS NOT NULL THEN
        GREATEST(l.updated_at, p.payment_date::timestamptz)
      WHEN l.updated_at IS NOT NULL THEN l.updated_at
      WHEN p.payment_date IS NOT NULL THEN p.payment_date::timestamptz
      ELSE NULL
    END AS last_activity_at
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt, max(updated_at) AS updated_at FROM loans WHERE user_id = u.id
  ) l ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM clients WHERE user_id = u.id
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt, max(payment_date) AS payment_date FROM payments WHERE user_id = u.id
  ) p ON true;
$$;

REVOKE ALL ON FUNCTION public.admin_usage_by_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_user() TO service_role;
