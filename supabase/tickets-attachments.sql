-- Migración: adjuntos en el ticket inicial (Nuevo ticket)
-- Aplicar después de tickets.sql en el SQL Editor.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';