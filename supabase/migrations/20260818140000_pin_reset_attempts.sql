-- Rate-limit PIN reset requests. Only the service role writes this table.

CREATE TABLE public.pin_reset_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dni text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pin_reset_attempts_dni_created_at_idx
  ON public.pin_reset_attempts (dni, created_at);

CREATE INDEX pin_reset_attempts_phone_created_at_idx
  ON public.pin_reset_attempts (phone, created_at);

ALTER TABLE public.pin_reset_attempts ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.pin_reset_attempts TO service_role;
REVOKE ALL ON public.pin_reset_attempts FROM anon, authenticated;
