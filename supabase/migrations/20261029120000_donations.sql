-- Donors give lots of food to a group of kitchens. The admin creates the lot; each kitchen records its
-- share as a stock entry linked to the lot, which feeds the G8 donation report.
CREATE TABLE IF NOT EXISTS public.donors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS donors_name_lower_idx ON public.donors (lower(name));

CREATE TABLE IF NOT EXISTS public.donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  donor_id uuid NOT NULL REFERENCES public.donors(id) ON DELETE RESTRICT,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  received_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS donations_code_upper_idx ON public.donations (upper(code));
CREATE INDEX IF NOT EXISTS donations_group_idx ON public.donations (group_id);

ALTER TABLE public.movimientos_insumo
  ADD COLUMN IF NOT EXISTS donation_id uuid REFERENCES public.donations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS movimientos_insumo_donation_idx ON public.movimientos_insumo (donation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.donors TO authenticated;
GRANT ALL ON public.donors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donations TO authenticated;
GRANT ALL ON public.donations TO service_role;

ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins gestionan donors" ON public.donors;
CREATE POLICY "admins gestionan donors" ON public.donors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins gestionan donations" ON public.donations;
CREATE POLICY "admins gestionan donations" ON public.donations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Lots a kitchen can link its stock entries to: those of its groups from the last 90 days.
CREATE OR REPLACE FUNCTION public.donations_for_kitchen(p_comedor_id uuid)
RETURNS TABLE (id uuid, code text, donor_name text, received_on date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.code, dn.name, d.received_on
  FROM public.donations d
  JOIN public.donors dn ON dn.id = d.donor_id
  JOIN public.group_kitchens gk ON gk.group_id = d.group_id AND gk.comedor_id = p_comedor_id
  WHERE (public.can_view_comedor(p_comedor_id) OR public.has_role(auth.uid(), 'admin'))
    AND d.received_on >= current_date - 90
  ORDER BY d.received_on DESC, d.code DESC;
$$;

GRANT EXECUTE ON FUNCTION public.donations_for_kitchen(uuid) TO authenticated;
