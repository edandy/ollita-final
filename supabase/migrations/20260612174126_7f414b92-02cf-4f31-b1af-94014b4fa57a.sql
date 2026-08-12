
-- Tabla de perfiles de clientes (consumidores que se registran para reservar y seguir comedores)
CREATE TABLE public.clientes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  dni TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente gestiona su propio perfil"
  ON public.clientes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Favoritos de un cliente (comedores que sigue)
CREATE TABLE public.favoritos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comedor_id UUID NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, comedor_id)
);

GRANT SELECT, INSERT, DELETE ON public.favoritos TO authenticated;
GRANT ALL ON public.favoritos TO service_role;

ALTER TABLE public.favoritos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente gestiona sus favoritos"
  ON public.favoritos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
