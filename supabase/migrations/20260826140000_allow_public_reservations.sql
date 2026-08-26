-- Public reservations can be limited to active padrón members (DNI match).

ALTER TABLE public.comedores
  ADD COLUMN IF NOT EXISTS allow_public_reservations boolean NOT NULL DEFAULT true;

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
    OR EXISTS (
      SELECT 1 FROM public.beneficiarios b
      WHERE b.comedor_id = reservas.comedor_id
        AND b.dni = reservas.dni
        AND b.activo = true
    )
  )
);
