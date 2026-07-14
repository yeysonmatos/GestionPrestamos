CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CLIENTES
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  nickname TEXT,
  sex TEXT DEFAULT '' CHECK (sex IN ('M', 'F', '')),
  document_type TEXT,
  email TEXT,
  phone TEXT,
  phone_alt TEXT,
  whatsapp TEXT,
  document TEXT,
  address TEXT,
  provincia TEXT,
  municipio TEXT,
  sector TEXT,
  calle TEXT,
  numero TEXT,
  referencia TEXT,
  gps_lat DECIMAL(10,7),
  gps_lng DECIMAL(10,7),
  photo TEXT,
  occupation TEXT,
  workplace TEXT,
  monthly_income DECIMAL(12,2) DEFAULT 0,
  "references" JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  trust_level TEXT DEFAULT 'medium' CHECK (trust_level IN ('high', 'medium', 'low')),
  trust_score INTEGER DEFAULT 50,
  notes TEXT,
  balance DECIMAL(12,2) DEFAULT 0,
  total_loans INTEGER DEFAULT 0,
  active_loans INTEGER DEFAULT 0,
  paid_loans INTEGER DEFAULT 0,
  late_loans INTEGER DEFAULT 0,
  total_borrowed DECIMAL(12,2) DEFAULT 0,
  total_paid DECIMAL(12,2) DEFAULT 0,
  total_interest DECIMAL(12,2) DEFAULT 0,
  last_payment_at TIMESTAMPTZ,
  last_loan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own clients" ON clients;
CREATE POLICY "Users can manage their own clients"
  ON clients FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_trust_level ON clients(trust_level);

-- PRÉSTAMOS
CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount DECIMAL(14,2) NOT NULL,
  interest_type TEXT NOT NULL CHECK (interest_type IN ('percentage', 'fixed')),
  interest_rate DECIMAL(8,4) NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  total_interest DECIMAL(14,2) NOT NULL,
  installment_amount DECIMAL(14,2) NOT NULL,
  installments INTEGER NOT NULL,
  paid_installments INTEGER DEFAULT 0,
  paid_amount DECIMAL(14,2) DEFAULT 0,
  remaining_amount DECIMAL(14,2) DEFAULT 0,
  progress DECIMAL(5,2) DEFAULT 0,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  start_date DATE NOT NULL,
  first_payment_date DATE NOT NULL,
  end_date DATE,
  amortization_type TEXT DEFAULT 'interest_only' CHECK (amortization_type IN ('interest_only', 'french')),
  open_ended BOOLEAN DEFAULT false,
  payment_day INTEGER CHECK (payment_day BETWEEN 1 AND 31),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid', 'late', 'cancelled')),
  late_days INTEGER DEFAULT 0,
  late_interest_rate DECIMAL(8,4) DEFAULT 0,
  guarantee TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own loans" ON loans;
CREATE POLICY "Users can manage their own loans"
  ON loans FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_client_id ON loans(client_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_loan_id ON loans(loan_id);

-- CUOTAS (amortización)
CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  capital DECIMAL(14,2) NOT NULL,
  interest DECIMAL(14,2) NOT NULL,
  balance DECIMAL(14,2) NOT NULL,
  paid_amount DECIMAL(14,2) DEFAULT 0,
  due_date DATE NOT NULL,
  paid_at DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'late')),
  late_days INTEGER DEFAULT 0,
  late_amount DECIMAL(14,2) DEFAULT 0
);

ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage installments on their loans" ON installments;
CREATE POLICY "Users can manage installments on their loans"
  ON installments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM loans WHERE loans.id = installments.loan_id AND loans.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_installments_loan_id ON installments(loan_id);
CREATE INDEX IF NOT EXISTS idx_installments_client_id ON installments(client_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);

-- PAGOS
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES installments(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(14,2) NOT NULL,
  capital_amount DECIMAL(14,2) DEFAULT 0,
  interest_amount DECIMAL(14,2) DEFAULT 0,
  late_amount DECIMAL(14,2) DEFAULT 0,
  type TEXT DEFAULT 'installment' CHECK (type IN ('installment', 'partial', 'capital_abono', 'liquidation')),
  payment_date DATE NOT NULL,
  method TEXT DEFAULT 'cash' CHECK (method IN ('cash', 'transfer', 'deposit', 'other')),
  notes TEXT,
  status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'reversed')),
  reversed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage payments on their loans" ON payments;
CREATE POLICY "Users can manage payments on their loans"
  ON payments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM loans WHERE loans.id = payments.loan_id AND loans.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_payments_loan_id ON payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- CONFIGURACIÓN
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT DEFAULT 'Mi Negocio',
  business_address TEXT DEFAULT '',
  business_phone TEXT DEFAULT '',
  business_email TEXT DEFAULT '',
  currency TEXT DEFAULT 'MXN',
  late_interest_rate DECIMAL(8,4) DEFAULT 0.5,
  loan_id_prefix TEXT DEFAULT 'L-',
  notify_upcoming_days INTEGER DEFAULT 3,
  default_installments INTEGER DEFAULT 10,
  default_frequency TEXT DEFAULT 'weekly' CHECK (default_frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  language TEXT DEFAULT 'es',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own settings" ON settings;
CREATE POLICY "Users can manage their own settings"
  ON settings FOR ALL
  USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);

-- DOCUMENTOS
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('contract', 'promissory', 'guarantee', 'photo', 'note')),
  path TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own documents" ON documents;
CREATE POLICY "Users can manage their own documents"
  ON documents FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);

-- Actualizar estadísticas del cliente
CREATE OR REPLACE FUNCTION public.update_client_stats(p_client_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  UPDATE clients SET
    total_loans     = (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id),
    active_loans    = (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND status IN ('active','late')),
    paid_loans      = (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND status = 'paid'),
    late_loans      = (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND status = 'late'),
    total_borrowed  = (SELECT COALESCE(SUM(amount),0) FROM loans WHERE client_id = p_client_id),
    total_interest  = (SELECT COALESCE(SUM(total_interest),0) FROM loans WHERE client_id = p_client_id),
    last_payment_at = (SELECT MAX(created_at) FROM payments WHERE client_id = p_client_id AND status = 'paid'),
    total_paid      = (
      SELECT COALESCE(SUM(paid_amount),0) FROM loans WHERE client_id = p_client_id
    ),
    balance         = (
      SELECT COALESCE(SUM(amount),0) FROM loans WHERE client_id = p_client_id AND status IN ('active','late')
    ) - (
      SELECT COALESCE(SUM(capital_amount),0) FROM payments
      WHERE client_id = p_client_id AND status = 'paid'
      AND payment_date IS NOT NULL
    )
  WHERE id = p_client_id;
END;
$$;

-- Insertar configuración por defecto al crear usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO settings (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- Trigger para crear settings automáticamente al registrarse
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- MIGRACIONES — Agrega columnas faltantes (seguro re-ejecutar)
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sex TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS document_type TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS provincia TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS calle TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referencia TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gps_lat DECIMAL(10,7);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gps_lng DECIMAL(10,7);

ALTER TABLE loans ADD COLUMN IF NOT EXISTS amortization_type TEXT DEFAULT 'interest_only';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS open_ended BOOLEAN DEFAULT false;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS payment_day INTEGER;
