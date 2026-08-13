-- ============================================================
-- SISTEMA DE SOPORTE — Tickets + mensajes
-- Multi-tenant por usuario + acceso admin (is_admin)
-- ============================================================

-- TICKETS DE SOPORTE
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- El autor crea/lee/edita sus propios tickets
DROP POLICY IF EXISTS "Author manages own tickets" ON support_tickets;
CREATE POLICY "Author manages own tickets"
  ON support_tickets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin puede leer y modificar todos los tickets
DROP POLICY IF EXISTS "Admin manages all tickets" ON support_tickets;
CREATE POLICY "Admin manages all tickets"
  ON support_tickets FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created ON support_tickets(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- MENSAJES DEL TICKET
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT false,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- El autor del ticket lee y responde dentro de sus tickets
DROP POLICY IF EXISTS "Author manages messages of own tickets" ON support_messages;
CREATE POLICY "Author manages messages of own tickets"
  ON support_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_messages.ticket_id
      AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_messages.ticket_id
      AND t.user_id = auth.uid()
    )
  );

-- Admin lee/inserta mensajes en cualquier ticket
DROP POLICY IF EXISTS "Admin manages all messages" ON support_messages;
CREATE POLICY "Admin manages all messages"
  ON support_messages FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at);

-- ============================================================
-- TRIGGER: mantener updated_at al modificar un ticket
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  UPDATE support_tickets
  SET updated_at = NOW()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_messages_touch ON support_messages;
CREATE TRIGGER trg_support_messages_touch
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_support_ticket();
