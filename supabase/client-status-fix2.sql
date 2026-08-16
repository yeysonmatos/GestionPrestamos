-- ------------------------------------------------------------
-- client-status-fix2: restaurar update_client_stats COMPLETO
--
-- Contexto: security-hardening.sql (aplicado 13 Ago 2026) reemplazó la
-- función y PERDIÓ el UPDATE de status/metricas (solo dejó trust_level/tru
-- st_score). Por eso los clientes sin préstamos nunca pasan a 'inactive'
-- y "Capital por cobrar"/balance del perfil no se refrescan.
--
-- Este archivo restaura el cuerpo completo de schema.sql:
--   * status  = CASE WHEN v_active_loans > 0 THEN 'active' ELSE 'inactive'
--   * total_loans, active_loans, paid_loans, late_loans
--   * total_borrowed, total_interest, last_payment_at, total_paid, balance
--   * trust_score/trust_level con la formula vigente (25/15/-10)
-- Y conserva la guarda de seguridad tolerante al rol del llamador
-- (superuser, postgres o service_role cuando auth.uid() es NULL),
-- idempotente (CREATE OR REPLACE).
--
-- Después de aplicarlo, correr el backfill:
--   SELECT public.update_client_stats(id) FROM clients;
--
-- Verificado con AGENTS.md (sesión 06 Ago 2026, sesión 6 y 11 Ago).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_client_stats(p_client_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_late_loans INTEGER;
  v_paid_loans INTEGER;
  v_total_loans INTEGER;
  v_active_loans INTEGER;
  v_score INTEGER;
BEGIN
  -- Guarda de seguridad: solo el dueño del cliente (o el sistema vía
  -- cron/management conectado como postgres/service_role) puede recalcular.
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
       AND current_user <> 'postgres'
       AND current_user <> 'service_role' THEN
      RETURN;
    END IF;
  ELSIF auth.uid() <> (SELECT user_id FROM clients WHERE id = p_client_id) THEN
    RETURN;
  END IF;

  -- Mora real: préstamos con al menos una cuota vencida hoy (no archivados).
  v_late_loans  := (SELECT COUNT(DISTINCT l.id) FROM loans l
                    WHERE l.client_id = p_client_id AND l.deleted_at IS NULL
                    AND EXISTS (
                      SELECT 1 FROM installments i
                      WHERE i.loan_id = l.id
                        AND i.status IN ('pending','partial','late')
                        AND i.due_date < public.today_rd()
                    ));
  v_paid_loans  := (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND status = 'paid' AND deleted_at IS NULL);
  v_total_loans := (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND deleted_at IS NULL);
  v_active_loans := (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND status IN ('active','late','late_1_30','late_31_60','late_61_90') AND deleted_at IS NULL);

  v_score := 50;
  IF v_late_loans = 0 THEN v_score := v_score + 25; END IF;
  IF v_paid_loans > 0 THEN v_score := v_score + 15; END IF;
  IF v_late_loans > 0 THEN v_score := v_score - 10; END IF;

  UPDATE clients SET
    total_loans     = v_total_loans,
    active_loans    = v_active_loans,
    status          = CASE WHEN v_active_loans > 0 THEN 'active' ELSE 'inactive' END,
    paid_loans      = v_paid_loans,
    late_loans      = v_late_loans,
    total_borrowed  = (SELECT COALESCE(SUM(amount),0) FROM loans WHERE client_id = p_client_id AND deleted_at IS NULL),
    total_interest  = (SELECT COALESCE(SUM(total_interest),0) FROM loans WHERE client_id = p_client_id AND deleted_at IS NULL),
    last_payment_at = (SELECT MAX(created_at) FROM payments WHERE client_id = p_client_id AND status = 'paid'),
    total_paid      = (SELECT COALESCE(SUM(amount),0) FROM payments WHERE client_id = p_client_id AND status = 'paid'),
    balance         = (SELECT COALESCE(SUM(remaining_amount),0) FROM loans WHERE client_id = p_client_id AND status IN ('active','late','late_1_30','late_31_60','late_61_90') AND deleted_at IS NULL),
    trust_score     = GREATEST(0, v_score),
    trust_level     = CASE
      WHEN v_score >= 75 THEN 'high'
      WHEN v_score >= 40 THEN 'medium'
      ELSE 'low'
    END
  WHERE id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_client_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_client_stats(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_client_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_stats(UUID) TO service_role;