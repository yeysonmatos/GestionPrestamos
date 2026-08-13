-- ============================================================
-- SISTEMA DE NOTIFICACIONES POR CORREO — Admin ↔ Prestamista
-- Tablas: smtp_config (una fila) + email_messages (cola/historial)
-- Envío compatible con SMTP (sin servicios de pago externos)
-- ============================================================

-- CONFIGURACIÓN SMTP (una sola fila, gestionada por el admin)
CREATE TABLE IF NOT EXISTS smtp_config (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-00000000e601',
  host TEXT NOT NULL DEFAULT '',
  port INTEGER NOT NULL DEFAULT 587,
  secure BOOLEAN NOT NULL DEFAULT false,
  username TEXT NOT NULL DEFAULT '',
  pass TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT 'Gestor de Prestamos',
  from_email TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE smtp_config ENABLE ROW LEVEL SECURITY;

-- Solo admin puede leer/escribir la config SMTP (credencial protegida)
DROP POLICY IF EXISTS "Only admin can read smtp_config" ON smtp_config;
CREATE POLICY "Only admin can read smtp_config"
  ON smtp_config FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Only admin can modify smtp_config" ON smtp_config;
CREATE POLICY "Only admin can modify smtp_config"
  ON smtp_config FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Bandeja/historial de mensajes de correo
CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('admin', 'prestamista')),
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

-- Admin ve y gestiona todos los mensajes
DROP POLICY IF EXISTS "Admin manages all email messages" ON email_messages;
CREATE POLICY "Admin manages all email messages"
  ON email_messages FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Prestamista puede leer los mensajes que se le enviaron a él
DROP POLICY IF EXISTS "Prestamista reads own messages" ON email_messages;
CREATE POLICY "Prestamista reads own messages"
  ON email_messages FOR SELECT
  USING (auth.uid() = recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_email_messages_status ON email_messages(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_recipient ON email_messages(recipient_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_dedupe ON email_messages(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_email_messages_entity ON email_messages(entity_type, entity_id);

-- Fila única de configuración SMTP (por defecto deshabilitada hasta configurarla)
INSERT INTO smtp_config (id) VALUES ('00000000-0000-0000-0000-00000000e601')
ON CONFLICT (id) DO NOTHING;