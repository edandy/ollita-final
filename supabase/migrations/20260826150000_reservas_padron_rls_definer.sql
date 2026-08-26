-- Anon cannot SELECT beneficiarios, so EXISTS in the INSERT policy always failed
-- even when verificar_padron (SECURITY DEFINER) had already found the DNI.

CREATE OR REPLACE FUNCTION public.dni_in_active_padron(_comedor_id uuid, _dni text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.beneficiarios b
    WHERE b.comedor_id = _comedor_id
      AND b.dni = _dni
      AND b.activo = true
  );
$$;

REVOKE ALL ON FUNCTION public.dni_in_active_padron(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dni_in_active_padron(uuid, text) TO anon, authenticated;

DROP POLICY IF EXISTS "cualquiera crea una reserva" ON public.reservas;
CREATE POLICY "cualquiera crea una reserva" ON public.reservas
FOR INSERT TO anon, authenticated
WITH CHECK (
  cantidad > 0
  AND EXISTS (
    SELECT 1 FROM public.menus m
    WHERE m.id = reservas.menu_id
      AND m.comedor_id = reservas.comedor_id
      AND m.publicado = true
      AND m.fecha >= (timezone('America/Lima', now()))::date
  )
  AND (
    EXISTS (
      SELECT 1 FROM public.comedores c
      WHERE c.id = reservas.comedor_id
        AND c.allow_public_reservations = true
    )
    OR public.dni_in_active_padron(reservas.comedor_id, reservas.dni)
  )
);
