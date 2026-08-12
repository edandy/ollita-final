ALTER TABLE public.reservas ADD COLUMN IF NOT EXISTS beneficiario_id uuid REFERENCES public.beneficiarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservas_beneficiario ON public.reservas(beneficiario_id);
CREATE INDEX IF NOT EXISTS idx_beneficiarios_comedor_dni ON public.beneficiarios(comedor_id, dni);

CREATE OR REPLACE FUNCTION public.verificar_padron(_comedor_id uuid, _dni text)
RETURNS TABLE (beneficiario_id uuid, nombre_completo text, categoria text, activo boolean, vigente boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.nombre_completo, b.categoria::text, b.activo,
         (b.vigencia_hasta IS NULL OR b.vigencia_hasta >= CURRENT_DATE)
  FROM public.beneficiarios b
  WHERE b.comedor_id = _comedor_id AND b.dni = _dni
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.verificar_padron(uuid, text) TO anon, authenticated;