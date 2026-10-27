-- One row per kitchen member, kitchen and day the member opened the panel. The G9 report counts
-- "usuarias activas" from it. Supervisors and admins are not members, so they are not logged.
CREATE TABLE IF NOT EXISTS public.kitchen_activity (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comedor_id uuid NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comedor_id, day)
);

CREATE INDEX IF NOT EXISTS kitchen_activity_comedor_day_idx ON public.kitchen_activity (comedor_id, day);

GRANT SELECT ON public.kitchen_activity TO authenticated;
GRANT ALL ON public.kitchen_activity TO service_role;

ALTER TABLE public.kitchen_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins ven kitchen_activity" ON public.kitchen_activity;
CREATE POLICY "admins ven kitchen_activity" ON public.kitchen_activity
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_kitchen_activity(p_comedor_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.kitchen_activity (user_id, comedor_id, day)
  SELECT auth.uid(), p_comedor_id, (now() AT TIME ZONE 'America/Lima')::date
  WHERE auth.uid() IS NOT NULL AND public.es_miembro_de(p_comedor_id)
  ON CONFLICT DO NOTHING;
$$;

GRANT EXECUTE ON FUNCTION public.log_kitchen_activity(uuid) TO authenticated;
