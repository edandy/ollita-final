ALTER TABLE public.reservas DROP CONSTRAINT IF EXISTS reservas_cantidad_check;
ALTER TABLE public.reservas ADD CONSTRAINT reservas_cantidad_check CHECK (cantidad >= 1 AND cantidad <= 50);