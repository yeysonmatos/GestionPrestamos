-- Agrega la columna 'type' a support_tickets (upgrade_request, payment_request)
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'support'
  CHECK (type IN ('support', 'upgrade_request', 'payment_request'));

-- Índice para filtro por tipo
CREATE INDEX IF NOT EXISTS idx_support_tickets_type ON public.support_tickets(type);