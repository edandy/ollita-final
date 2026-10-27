-- Joint purchases of a group for a month (G11): which kitchens take part and the price negotiated for
-- each supply. Quantities and current prices are computed from each kitchen's almacén.
CREATE TABLE IF NOT EXISTS public.joint_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, month)
);

CREATE TABLE IF NOT EXISTS public.joint_purchase_kitchens (
  purchase_id uuid NOT NULL REFERENCES public.joint_purchases(id) ON DELETE CASCADE,
  comedor_id uuid NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  PRIMARY KEY (purchase_id, comedor_id)
);

CREATE TABLE IF NOT EXISTS public.joint_purchase_prices (
  purchase_id uuid NOT NULL REFERENCES public.joint_purchases(id) ON DELETE CASCADE,
  supply_key text NOT NULL,
  label text NOT NULL,
  unit public.insumo_unidad NOT NULL,
  negotiated_price numeric(10,2) NOT NULL CHECK (negotiated_price > 0),
  PRIMARY KEY (purchase_id, supply_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.joint_purchases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.joint_purchase_kitchens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.joint_purchase_prices TO authenticated;
GRANT ALL ON public.joint_purchases, public.joint_purchase_kitchens, public.joint_purchase_prices TO service_role;

ALTER TABLE public.joint_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.joint_purchase_kitchens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.joint_purchase_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins gestionan joint_purchases" ON public.joint_purchases;
CREATE POLICY "admins gestionan joint_purchases" ON public.joint_purchases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins gestionan joint_purchase_kitchens" ON public.joint_purchase_kitchens;
CREATE POLICY "admins gestionan joint_purchase_kitchens" ON public.joint_purchase_kitchens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins gestionan joint_purchase_prices" ON public.joint_purchase_prices;
CREATE POLICY "admins gestionan joint_purchase_prices" ON public.joint_purchase_prices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
