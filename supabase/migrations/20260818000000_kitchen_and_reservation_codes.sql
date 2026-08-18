-- Unique 5-char kitchen code + unique reservation codes.

ALTER TABLE public.comedores ADD COLUMN IF NOT EXISTS code text;

DO $$
DECLARE
  r RECORD;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  i int;
BEGIN
  FOR r IN SELECT id FROM public.comedores WHERE code IS NULL LOOP
    LOOP
      result := '';
      FOR i IN 1..5 LOOP
        result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.comedores WHERE code = result);
    END LOOP;
    UPDATE public.comedores SET code = result WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.comedores
  ALTER COLUMN code SET NOT NULL;

ALTER TABLE public.comedores
  DROP CONSTRAINT IF EXISTS comedores_code_key;
ALTER TABLE public.comedores
  ADD CONSTRAINT comedores_code_key UNIQUE (code);

ALTER TABLE public.comedores
  DROP CONSTRAINT IF EXISTS comedores_code_format_chk;
ALTER TABLE public.comedores
  ADD CONSTRAINT comedores_code_format_chk
  CHECK (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$');

DO $$
DECLARE
  dup RECORD;
  rec RECORD;
  n int;
BEGIN
  FOR dup IN
    SELECT codigo FROM public.reservas GROUP BY codigo HAVING COUNT(*) > 1
  LOOP
    n := 0;
    FOR rec IN
      SELECT id FROM public.reservas WHERE codigo = dup.codigo ORDER BY created_at, id
    LOOP
      IF n > 0 THEN
        UPDATE public.reservas
        SET codigo = dup.codigo || '-D' || n::text
        WHERE id = rec.id;
      END IF;
      n := n + 1;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.reservas
  DROP CONSTRAINT IF EXISTS reservas_codigo_key;
ALTER TABLE public.reservas
  ADD CONSTRAINT reservas_codigo_key UNIQUE (codigo);

CREATE OR REPLACE FUNCTION public.fill_comedor_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  i int;
BEGIN
  IF NEW.code IS NOT NULL AND NEW.code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    RETURN NEW;
  END IF;
  LOOP
    result := '';
    FOR i IN 1..5 LOOP
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.comedores WHERE code = result AND id IS DISTINCT FROM NEW.id);
  END LOOP;
  NEW.code := result;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fill_comedor_code ON public.comedores;
CREATE TRIGGER tg_fill_comedor_code
  BEFORE INSERT OR UPDATE ON public.comedores
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_comedor_code();

NOTIFY pgrst, 'reload schema';
