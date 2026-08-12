
ALTER TABLE public.usuarios_comedor
  ADD COLUMN IF NOT EXISTS telefono TEXT,
  ADD COLUMN IF NOT EXISTS dni TEXT;

ALTER TABLE public.usuarios_comedor
  ADD CONSTRAINT usuarios_comedor_telefono_chk CHECK (telefono IS NULL OR telefono ~ '^\d{9}$'),
  ADD CONSTRAINT usuarios_comedor_dni_chk CHECK (dni IS NULL OR dni ~ '^\d{8}$');

ALTER TABLE public.clientes
  ALTER COLUMN telefono SET NOT NULL,
  ALTER COLUMN dni SET NOT NULL;

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_telefono_chk CHECK (telefono ~ '^\d{9}$'),
  ADD CONSTRAINT clientes_dni_chk CHECK (dni ~ '^\d{8}$');
