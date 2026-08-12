ALTER TABLE public.beneficiarios ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE public.beneficiarios DROP CONSTRAINT IF EXISTS beneficiarios_telefono_check;
ALTER TABLE public.beneficiarios ADD CONSTRAINT beneficiarios_telefono_check CHECK (telefono IS NULL OR telefono ~ '^\d{9}$');