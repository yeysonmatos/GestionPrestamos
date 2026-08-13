-- ============================================================
-- ONBOARDING — registro en 3 pasos
-- Agrega country / timezone / onboarding_completed a settings
-- ============================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'República Dominicana';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'GMT-4';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT true;

-- Usuarios existentes que NO han configurado su negocio → deben pasar onboarding
UPDATE settings
SET onboarding_completed = false
WHERE business_name IS NULL
   OR TRIM(business_name) = ''
   OR business_name = 'Mi Negocio';

-- Default de moneda a Peso Dominicano (solo afecta registros nuevos)
ALTER TABLE settings
  ALTER COLUMN currency SET DEFAULT 'DOP';
