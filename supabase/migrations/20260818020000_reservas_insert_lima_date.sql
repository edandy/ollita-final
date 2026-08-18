-- Walk-in deliveries from /panel were blocked after 19:00 in Peru:
-- INSERT policy compared menu.fecha to CURRENT_DATE (UTC).

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
);

DROP POLICY IF EXISTS "equipo registra entregas" ON public.reservas;
CREATE POLICY "equipo registra entregas" ON public.reservas
FOR INSERT TO authenticated
WITH CHECK (
  public.can_write_comedor(comedor_id)
  OR public.has_role(auth.uid(), 'admin')
);
