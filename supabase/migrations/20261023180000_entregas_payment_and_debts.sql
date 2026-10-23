ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS payment_method text;

ALTER TABLE public.transacciones
  DROP CONSTRAINT IF EXISTS transacciones_payment_method_check;

ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('efectivo', 'yape'));

CREATE TABLE IF NOT EXISTS public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comedor_id uuid NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  beneficiario_id uuid REFERENCES public.beneficiarios(id) ON DELETE SET NULL,
  person_name text NOT NULL,
  dni text,
  reservation_id uuid REFERENCES public.reservas(id) ON DELETE SET NULL,
  servings integer NOT NULL CHECK (servings > 0),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid')),
  paid_at timestamptz,
  paid_transaction_id uuid REFERENCES public.transacciones(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS debts_comedor_status_idx ON public.debts (comedor_id, status);
CREATE INDEX IF NOT EXISTS debts_reservation_idx ON public.debts (reservation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.debts TO authenticated;
GRANT ALL ON public.debts TO service_role;

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "socias ven debts" ON public.debts;
CREATE POLICY "socias ven debts" ON public.debts
  FOR SELECT TO authenticated
  USING (public.can_view_comedor(comedor_id));

DROP POLICY IF EXISTS "socias escriben debts" ON public.debts;
CREATE POLICY "socias escriben debts" ON public.debts
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_comedor(comedor_id));

DROP POLICY IF EXISTS "socias actualizan debts" ON public.debts;
CREATE POLICY "socias actualizan debts" ON public.debts
  FOR UPDATE TO authenticated
  USING (public.can_write_comedor(comedor_id))
  WITH CHECK (public.can_write_comedor(comedor_id));

DROP POLICY IF EXISTS "socias borran debts" ON public.debts;
CREATE POLICY "socias borran debts" ON public.debts
  FOR DELETE TO authenticated
  USING (public.can_write_comedor(comedor_id));
