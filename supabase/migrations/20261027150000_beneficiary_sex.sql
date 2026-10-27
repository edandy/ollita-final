-- Optional sex for padrón people. Staff are assigned from the padrón, so the G5 group report reads it to
-- count women in board roles.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sex') THEN
    CREATE TYPE public.sex AS ENUM ('female', 'male');
  END IF;
END $$;

ALTER TABLE public.beneficiarios
  ADD COLUMN IF NOT EXISTS sex public.sex;
