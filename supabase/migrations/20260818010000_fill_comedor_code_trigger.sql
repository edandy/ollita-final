-- Idempotent: fill kitchen code on insert/update and refresh PostgREST cache.

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
