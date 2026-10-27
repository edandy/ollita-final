-- Care group and birth date for the padrón. They sit beside `categoria` (how the person relates to the
-- kitchen) and feed the G4 group report's population breakdown and age bands.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'care_group') THEN
    CREATE TYPE public.care_group AS ENUM (
      'older_adult',
      'child',
      'social_case',
      'disability',
      'pregnant',
      'lactating'
    );
  END IF;
END $$;

ALTER TABLE public.beneficiarios
  ADD COLUMN IF NOT EXISTS care_group public.care_group,
  ADD COLUMN IF NOT EXISTS birth_date date;
