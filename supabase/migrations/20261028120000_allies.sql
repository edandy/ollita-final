-- Allies (partner organizations) support one or more kitchens, and a kitchen can have several allies.
-- The G7 impact report is built for one ally from the kitchens it supports.
CREATE TABLE IF NOT EXISTS public.allies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS allies_name_lower_idx ON public.allies (lower(name));

CREATE TABLE IF NOT EXISTS public.ally_kitchens (
  ally_id uuid NOT NULL REFERENCES public.allies(id) ON DELETE CASCADE,
  comedor_id uuid NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ally_id, comedor_id)
);

CREATE INDEX IF NOT EXISTS ally_kitchens_comedor_idx ON public.ally_kitchens (comedor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.allies TO authenticated;
GRANT ALL ON public.allies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ally_kitchens TO authenticated;
GRANT ALL ON public.ally_kitchens TO service_role;

ALTER TABLE public.allies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ally_kitchens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins gestionan allies" ON public.allies;
CREATE POLICY "admins gestionan allies" ON public.allies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins gestionan ally_kitchens" ON public.ally_kitchens;
CREATE POLICY "admins gestionan ally_kitchens" ON public.ally_kitchens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
