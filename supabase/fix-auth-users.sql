-- ============================================================
-- FIX: endpoint GoTrue "Database error finding users" (500)
-- Causa: una fila corrupta en auth.users (5b37db05…) rompe el
-- listado completo de usuarios del panel.
-- 1) Borra la fila corrupta (cascade a settings/app_users/subscriptions)
-- 2) Crea admin_list_users(): lee auth.users vía PostgREST,
--    sin depender del endpoint GoTrue /admin/users
-- ============================================================

-- 1) Eliminar la cuenta corrupta que rompe el listado
DELETE FROM auth.users WHERE id = '5b37db05-4f66-4d35-8140-58ab5e7ceb32';

-- 2) Función segura para listar usuarios del panel (solo admin)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT u.id, u.email, u.created_at, u.last_sign_in_at
  FROM auth.users u
  ORDER BY u.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO service_role;

-- Sanity: verifica que el listado ya no tenga filas corruptas
SELECT id, email, created_at FROM auth.users ORDER BY created_at;
