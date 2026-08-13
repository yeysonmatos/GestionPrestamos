-- Config: nuevos valores por defecto
-- Tasa de mora diaria default = 0 (el prestamista la ajusta)
-- Prefijo ID préstamo default = 'P' (el prestamista lo ajusta)
ALTER TABLE public.settings ALTER COLUMN late_interest_rate SET DEFAULT 0;
ALTER TABLE public.settings ALTER COLUMN loan_id_prefix SET DEFAULT 'P';

-- Aplicar a filas existentes que todavía usan los valores antiguos por defecto
UPDATE public.settings SET late_interest_rate = 0 WHERE late_interest_rate = 0.5;
UPDATE public.settings SET loan_id_prefix = 'P' WHERE loan_id_prefix = 'L-';