-- 1) Roles de plataforma
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Cada quien ve sus roles" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 2) Invitaciones
CREATE TABLE public.invitaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comedor_id uuid NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  cargo public.cargo_socia NOT NULL DEFAULT 'socia',
  token text NOT NULL UNIQUE,
  email text,
  nombre text,
  creado_por uuid,
  expira_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  usado_at timestamptz,
  usado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitaciones TO authenticated;
GRANT ALL ON public.invitaciones TO service_role;
ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Presidenta o admin gestionan invitaciones" ON public.invitaciones
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.usuarios_comedor uc
             WHERE uc.comedor_id = invitaciones.comedor_id
               AND uc.user_id = auth.uid() AND uc.cargo = 'presidenta')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.usuarios_comedor uc
             WHERE uc.comedor_id = invitaciones.comedor_id
               AND uc.user_id = auth.uid() AND uc.cargo = 'presidenta')
);

-- 3) Padrón: dirección y carga familiar
ALTER TABLE public.beneficiarios
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS carga_familiar integer NOT NULL DEFAULT 0;

-- 4) Acceso total del administrador de plataforma
CREATE POLICY "Admin gestiona comedores" ON public.comedores
FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin gestiona personal" ON public.usuarios_comedor
FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin gestiona beneficiarios" ON public.beneficiarios
FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));