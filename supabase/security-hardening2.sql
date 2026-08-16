-- ============================================================
-- SECURITY HARDENING #2 — RPCs que siguieron expuestos tras la
-- primer pasada (admin_list_users, admin_usage_stats,
-- admin_usage_by_user) + fix de guarda en update_all_loan_statuses
-- usando session_user (SECURITY DEFINER corre como el owner, así
-- que current_user no distingue al llamador anónimo).
-- Vía scripts/exec-security-hardening2.mjs
-- ============================================================

-- ------------------------------------------------------------
-- admin_list_users: revocar de PUBLIC/anon/authenticated (solo service_role + postgres)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO service_role;

-- ------------------------------------------------------------
-- admin_usage_stats: ídem
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_usage_stats(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_usage_stats(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_usage_stats(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_usage_stats(TEXT) TO service_role;

-- ------------------------------------------------------------
-- admin_usage_by_user: ídem (firma: sin argumentos)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_usage_by_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_usage_by_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_user() TO service_role;

-- ------------------------------------------------------------
-- update_all_loan_statuses: guarda con session_user (bloquea anon/authenticated,
-- permite cron/management como postgres y service_role).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_all_loan_statuses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_loan RECORD;
  v_max_late_days INTEGER;
  v_new_status TEXT;
  v_updated_count INTEGER := 0;
BEGIN
  -- SECURITY DEFINER corre como el owner; usar session_user para detectar
  -- al llamador real. Bloquea anon/authenticated; permite postgres/service_role.
  IF session_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Función reservada al sistema';
  END IF;

  FOR v_loan IN
    SELECT id FROM loans
    WHERE status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
  LOOP
    SELECT COALESCE(MAX(GREATEST(0, public.today_rd() - due_date)), 0)
    INTO v_max_late_days
    FROM installments
    WHERE loan_id = v_loan.id
    AND status IN ('pending', 'partial', 'late');

    IF v_max_late_days <= 0 THEN
      CONTINUE;
    END IF;

    IF v_max_late_days <= 30 THEN
      v_new_status := 'late_1_30';
    ELSIF v_max_late_days <= 60 THEN
      v_new_status := 'late_31_60';
    ELSE
      v_new_status := 'late_61_90';
    END IF;

    UPDATE loans
    SET status = v_new_status,
        late_days = v_max_late_days
    WHERE id = v_loan.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.update_all_loan_statuses() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_all_loan_statuses() FROM anon;
REVOKE ALL ON FUNCTION public.update_all_loan_statuses() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_all_loan_statuses() TO service_role;