ALTER TABLE public.reservas ADD COLUMN IF NOT EXISTS dni TEXT;
ALTER TABLE public.reservas ADD CONSTRAINT reservas_dni_check CHECK (dni IS NULL OR dni ~ '^\d{8}$');