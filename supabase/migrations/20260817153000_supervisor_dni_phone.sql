-- Store the same identity fields used when creating a kitchen manager.

ALTER TABLE public.supervisors
  ADD COLUMN dni text,
  ADD COLUMN phone text;

CREATE UNIQUE INDEX supervisors_dni_unique ON public.supervisors (dni)
  WHERE dni IS NOT NULL;
