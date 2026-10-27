-- Loans of supplies between kitchens of a group (G10). The lending kitchen records the loan, which takes
-- the stock out; the receiving kitchen confirms it, which adds the stock. Both movements carry the
-- transfer, so reports do not count them as consumption.
CREATE TABLE IF NOT EXISTS public.supply_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_comedor_id uuid NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  to_comedor_id uuid NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  supply_name text NOT NULL,
  unit public.insumo_unidad NOT NULL,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  sent_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Lima')::date),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'received')),
  received_on date,
  from_movement_id uuid REFERENCES public.movimientos_insumo(id) ON DELETE SET NULL,
  to_movement_id uuid REFERENCES public.movimientos_insumo(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_comedor_id <> to_comedor_id)
);

CREATE INDEX IF NOT EXISTS supply_transfers_from_idx ON public.supply_transfers (from_comedor_id, sent_on);
CREATE INDEX IF NOT EXISTS supply_transfers_to_idx ON public.supply_transfers (to_comedor_id, status);

ALTER TABLE public.movimientos_insumo
  ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.supply_transfers(id) ON DELETE SET NULL;

GRANT SELECT ON public.supply_transfers TO authenticated;
GRANT ALL ON public.supply_transfers TO service_role;

ALTER TABLE public.supply_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ollas ven sus prestamos" ON public.supply_transfers;
CREATE POLICY "ollas ven sus prestamos" ON public.supply_transfers
  FOR SELECT TO authenticated
  USING (
    public.can_view_comedor(from_comedor_id)
    OR public.can_view_comedor(to_comedor_id)
    OR public.has_role(auth.uid(), 'admin')
  );

-- The other kitchens of this kitchen's groups: who it can lend to.
CREATE OR REPLACE FUNCTION public.group_kitchens_for(p_comedor_id uuid)
RETURNS TABLE (id uuid, nombre text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT c.id, c.nombre
  FROM public.group_kitchens mine
  JOIN public.group_kitchens other ON other.group_id = mine.group_id AND other.comedor_id <> p_comedor_id
  JOIN public.comedores c ON c.id = other.comedor_id
  WHERE mine.comedor_id = p_comedor_id
    AND (public.can_view_comedor(p_comedor_id) OR public.has_role(auth.uid(), 'admin'))
  ORDER BY c.nombre;
$$;

CREATE OR REPLACE FUNCTION public.lend_supply(
  p_insumo_id uuid,
  p_to_comedor_id uuid,
  p_cantidad numeric,
  p_nota text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supply public.insumos%ROWTYPE;
  receiver_name text;
  v_transfer_id uuid;
  movement_id uuid;
BEGIN
  SELECT * INTO supply FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos ese insumo.';
  END IF;
  IF NOT public.can_write_comedor(supply.comedor_id) THEN
    RAISE EXCEPTION 'No tienes permiso para prestar desde esta olla.';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Escribe cuánto prestas.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.group_kitchens mine
    JOIN public.group_kitchens other ON other.group_id = mine.group_id
    WHERE mine.comedor_id = supply.comedor_id AND other.comedor_id = p_to_comedor_id
      AND p_to_comedor_id <> supply.comedor_id
  ) THEN
    RAISE EXCEPTION 'Esa olla no es de tu grupo.';
  END IF;
  IF supply.stock_actual < p_cantidad THEN
    RAISE EXCEPTION 'No tienes stock suficiente para prestar.';
  END IF;

  SELECT nombre INTO receiver_name FROM public.comedores WHERE id = p_to_comedor_id;

  INSERT INTO public.supply_transfers (from_comedor_id, to_comedor_id, supply_name, unit, quantity, created_by)
  VALUES (supply.comedor_id, p_to_comedor_id, supply.nombre, supply.unidad, p_cantidad, auth.uid())
  RETURNING id INTO v_transfer_id;

  INSERT INTO public.movimientos_insumo (insumo_id, tipo, cantidad, nota, transfer_id)
  VALUES (
    supply.id,
    'salida',
    p_cantidad,
    concat_ws(' · ', 'Préstamo a ' || receiver_name, nullif(trim(coalesce(p_nota, '')), '')),
    v_transfer_id
  )
  RETURNING id INTO movement_id;

  UPDATE public.insumos SET stock_actual = stock_actual - p_cantidad WHERE id = supply.id;
  UPDATE public.supply_transfers SET from_movement_id = movement_id WHERE id = v_transfer_id;
  RETURN v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_supply_transfer(p_transfer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  loan public.supply_transfers%ROWTYPE;
  target_id uuid;
  source_origin public.insumo_origen;
  lender_name text;
  movement_id uuid;
BEGIN
  SELECT * INTO loan FROM public.supply_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos ese préstamo.';
  END IF;
  IF NOT public.can_write_comedor(loan.to_comedor_id) THEN
    RAISE EXCEPTION 'No tienes permiso para recibir en esta olla.';
  END IF;
  IF loan.status <> 'sent' THEN
    RAISE EXCEPTION 'Este préstamo ya se recibió.';
  END IF;

  SELECT id INTO target_id FROM public.insumos
  WHERE comedor_id = loan.to_comedor_id
    AND lower(trim(nombre)) = lower(trim(loan.supply_name))
    AND unidad = loan.unit
  ORDER BY created_at
  LIMIT 1;

  IF target_id IS NULL THEN
    SELECT i.origen INTO source_origin FROM public.movimientos_insumo m
    JOIN public.insumos i ON i.id = m.insumo_id
    WHERE m.id = loan.from_movement_id;
    INSERT INTO public.insumos (comedor_id, nombre, unidad, stock_actual, origen)
    VALUES (loan.to_comedor_id, trim(loan.supply_name), loan.unit, 0, coalesce(source_origin, 'comprado'))
    RETURNING id INTO target_id;
  END IF;

  SELECT nombre INTO lender_name FROM public.comedores WHERE id = loan.from_comedor_id;

  INSERT INTO public.movimientos_insumo (insumo_id, tipo, cantidad, nota, transfer_id)
  VALUES (target_id, 'ingreso', loan.quantity, 'Préstamo de ' || lender_name, loan.id)
  RETURNING id INTO movement_id;

  UPDATE public.insumos SET stock_actual = stock_actual + loan.quantity WHERE id = target_id;
  UPDATE public.supply_transfers
  SET status = 'received',
      received_on = (now() AT TIME ZONE 'America/Lima')::date,
      to_movement_id = movement_id
  WHERE id = loan.id;
  RETURN loan.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.group_kitchens_for(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lend_supply(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_supply_transfer(uuid) TO authenticated;
