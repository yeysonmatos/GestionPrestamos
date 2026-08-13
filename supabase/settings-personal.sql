-- Información personal separada de la información del negocio
ALTER TABLE settings ADD COLUMN IF NOT EXISTS personal_name TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS personal_phone TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS personal_email TEXT DEFAULT '';