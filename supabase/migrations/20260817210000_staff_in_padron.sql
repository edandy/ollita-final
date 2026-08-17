-- Every team member (including presidenta) must appear in the padrón.

INSERT INTO public.beneficiarios (
  comedor_id, nombre_completo, dni, telefono, categoria, carga_familiar, activo
)
SELECT
  uc.comedor_id,
  uc.nombre,
  uc.dni,
  uc.telefono,
  'socia_familia',
  0,
  true
FROM public.usuarios_comedor uc
WHERE uc.dni IS NOT NULL
  AND uc.dni ~ '^\d{8}$'
  AND uc.cargo IS DISTINCT FROM 'socia'
ON CONFLICT (comedor_id, dni) DO NOTHING;

CREATE OR REPLACE FUNCTION public.prevent_delete_staff_from_padron()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.usuarios_comedor uc
    WHERE uc.comedor_id = OLD.comedor_id
      AND uc.dni = OLD.dni
      AND uc.cargo IS DISTINCT FROM 'socia'
  ) THEN
    RAISE EXCEPTION 'staff_in_padron';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_prevent_delete_staff_from_padron ON public.beneficiarios;
CREATE TRIGGER tg_prevent_delete_staff_from_padron
  BEFORE DELETE ON public.beneficiarios
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_staff_from_padron();
