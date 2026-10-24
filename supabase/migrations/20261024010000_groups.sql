CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS groups_name_lower_idx ON public.groups (lower(name));

CREATE TABLE IF NOT EXISTS public.group_kitchens (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  comedor_id uuid NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, comedor_id)
);

CREATE INDEX IF NOT EXISTS group_kitchens_comedor_idx ON public.group_kitchens (comedor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_kitchens TO authenticated;
GRANT ALL ON public.group_kitchens TO service_role;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_kitchens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins gestionan groups" ON public.groups;
CREATE POLICY "admins gestionan groups" ON public.groups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins gestionan group_kitchens" ON public.group_kitchens;
CREATE POLICY "admins gestionan group_kitchens" ON public.group_kitchens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
