-- ============================================================
-- backup-restore-transactional.sql — Restore transaccional (A1)
--
-- RPC public.restore_user_backup(): borra + inserta TODO el
-- backup del usuario en UNA sola transacción PostgreSQL. Si
-- cualquier paso falla, la transacción completa se revierte
-- (rollback automático) → nunca quedan tablas vacías/parciales.
--
-- Además:
--  * Valida que quien llama es el dueño (auth.uid() = p_user_id)
--    o el sistema (postgres / service_role / superuser).
--  * Desactiva el trigger de límite de clientes durante el restore
--    (restaurar un backup no debe fallar por límite de plan).
--  * Recalcula update_client_stats() de cada cliente restaurado
--    (confianza/balance/estado frescos de inmediato).
--  * Valida UUIDs/timestamps tipados vía jsonb_populate_record:
--    si un valor que debe ser uuid es basura, la transacción
--    revierte y devuelve error (protección contra CSV corrupto).
--
-- Idempotente (CREATE OR REPLACE). Vía scripts/exec-backup-restore-
-- transactional.mjs.
-- ============================================================

CREATE OR REPLACE FUNCTION public.restore_user_backup(
  p_user_id UUID,
  p_settings JSONB DEFAULT '[]',
  p_clients JSONB DEFAULT '[]',
  p_loans JSONB DEFAULT '[]',
  p_installments JSONB DEFAULT '[]',
  p_payments JSONB DEFAULT '[]',
  p_documents JSONB DEFAULT '[]'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_client RECORD;
BEGIN
  -- Guarda de seguridad: solo el dueño (auth.uid() = p_user_id) o el sistema.
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
       AND current_user <> 'postgres'
       AND current_user <> 'service_role' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
    END IF;
  ELSIF auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  -- Durante el restore omitimos el límite de clientes del plan
  -- (restaurar un histórico no debe verse bloqueado por el plan).
  ALTER TABLE public.clients DISABLE TRIGGER trg_enforce_client_limit;

  BEGIN
    -- 0. Limpieza en orden de FKs (hijos primero).
    DELETE FROM public.installments
      WHERE loan_id IN (SELECT id FROM public.loans WHERE user_id = p_user_id);
    DELETE FROM public.payments WHERE user_id = p_user_id;
    DELETE FROM public.documents WHERE user_id = p_user_id;
    DELETE FROM public.loans WHERE user_id = p_user_id;
    DELETE FROM public.clients WHERE user_id = p_user_id;
    DELETE FROM public.settings WHERE user_id = p_user_id;

    -- 1. settings (1 fila por usuario)
    INSERT INTO public.settings
      SELECT (jsonb_populate_record(NULL::public.settings, value)).*
      FROM jsonb_array_elements(p_settings) AS value;

    -- 2. clients
    INSERT INTO public.clients
      SELECT (jsonb_populate_record(NULL::public.clients, value)).*
      FROM jsonb_array_elements(p_clients) AS value;

    -- 3. loans
    INSERT INTO public.loans
      SELECT (jsonb_populate_record(NULL::public.loans, value)).*
      FROM jsonb_array_elements(p_loans) AS value;

    -- 4. installments
    INSERT INTO public.installments
      SELECT (jsonb_populate_record(NULL::public.installments, value)).*
      FROM jsonb_array_elements(p_installments) AS value;

    -- 5. payments
    INSERT INTO public.payments
      SELECT (jsonb_populate_record(NULL::public.payments, value)).*
      FROM jsonb_array_elements(p_payments) AS value;

    -- 6. documents
    INSERT INTO public.documents
      SELECT (jsonb_populate_record(NULL::public.documents, value)).*
      FROM jsonb_array_elements(p_documents) AS value;

    -- 7. Recalcular métricas derivadas de cada cliente restaurado.
    FOR v_client IN SELECT id FROM public.clients WHERE user_id = p_user_id LOOP
      PERFORM public.update_client_stats(v_client.id);
    END LOOP;

    ALTER TABLE public.clients ENABLE TRIGGER trg_enforce_client_limit;

    RETURN jsonb_build_object(
      'ok', true,
      'clients', (SELECT count(*)::int FROM public.clients     WHERE user_id = p_user_id),
      'loans',   (SELECT count(*)::int FROM public.loans       WHERE user_id = p_user_id),
      'installments', (SELECT count(*)::int FROM public.installments WHERE loan_id IN
                        (SELECT id FROM public.loans WHERE user_id = p_user_id)),
      'payments',(SELECT count(*)::int FROM public.payments    WHERE user_id = p_user_id),
      'documents',(SELECT count(*)::int FROM public.documents  WHERE user_id = p_user_id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Asegurar que el trigger vuelve a estar activo antes del rollback.
    BEGIN
      ALTER TABLE public.clients ENABLE TRIGGER trg_enforce_client_limit;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_user_backup(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_user_backup(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_user_backup(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_user_backup(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) TO service_role;