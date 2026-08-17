-- Supervisors: platform users assigned to one or more kitchens, never kitchen members.

CREATE TYPE public.access_level AS ENUM ('view', 'full');

CREATE TABLE public.supervisors (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  access_level public.access_level NOT NULL DEFAULT 'view',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supervisor_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.supervisors(user_id) ON DELETE CASCADE,
  comedor_id uuid NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, comedor_id)
);

GRANT SELECT ON public.supervisors, public.supervisor_assignments TO authenticated;
GRANT ALL ON public.supervisors, public.supervisor_assignments TO service_role;

ALTER TABLE public.supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supervisors read own profile" ON public.supervisors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin manages supervisors" ON public.supervisors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Supervisors read own assignments" ON public.supervisor_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin manages supervisor assignments" ON public.supervisor_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.prevent_supervisor_if_kitchen_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuarios_comedor WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Esa persona ya es integrante de una olla';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_member_if_supervisor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'supervisor')
     OR EXISTS (SELECT 1 FROM public.supervisors WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Un supervisor no puede ser integrante de una olla';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_supervisors_not_member
  BEFORE INSERT OR UPDATE ON public.supervisors
  FOR EACH ROW EXECUTE FUNCTION public.prevent_supervisor_if_kitchen_member();

CREATE TRIGGER tg_supervisor_role_not_member
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  WHEN (NEW.role = 'supervisor')
  EXECUTE FUNCTION public.prevent_supervisor_if_kitchen_member();

CREATE TRIGGER tg_supervisor_assignments_not_member
  BEFORE INSERT OR UPDATE ON public.supervisor_assignments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_supervisor_if_kitchen_member();

CREATE TRIGGER tg_usuarios_comedor_not_supervisor
  BEFORE INSERT OR UPDATE ON public.usuarios_comedor
  FOR EACH ROW EXECUTE FUNCTION public.prevent_member_if_supervisor();

CREATE OR REPLACE FUNCTION public.can_view_comedor(_comedor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.es_miembro_de(_comedor_id)
      OR EXISTS (
        SELECT 1 FROM public.supervisor_assignments sa
        WHERE sa.user_id = auth.uid() AND sa.comedor_id = _comedor_id
      );
$$;

CREATE OR REPLACE FUNCTION public.can_write_comedor(_comedor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.es_miembro_de(_comedor_id)
      OR EXISTS (
        SELECT 1
        FROM public.supervisor_assignments sa
        JOIN public.supervisors s ON s.user_id = sa.user_id
        WHERE sa.user_id = auth.uid()
          AND sa.comedor_id = _comedor_id
          AND s.access_level = 'full'
      );
$$;

CREATE OR REPLACE FUNCTION public.is_full_supervisor_of(_comedor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.supervisor_assignments sa
    JOIN public.supervisors s ON s.user_id = sa.user_id
    WHERE sa.user_id = auth.uid()
      AND sa.comedor_id = _comedor_id
      AND s.access_level = 'full'
  );
$$;

-- comedores
DROP POLICY IF EXISTS "publico ve comedores activos" ON public.comedores;
CREATE POLICY "publico ve comedores activos" ON public.comedores
  FOR SELECT TO anon, authenticated
  USING (activo = true OR public.can_view_comedor(id));

DROP POLICY IF EXISTS "socias actualizan su comedor" ON public.comedores;
CREATE POLICY "socias actualizan su comedor" ON public.comedores
  FOR UPDATE TO authenticated
  USING (public.can_write_comedor(id))
  WITH CHECK (public.can_write_comedor(id));

-- usuarios_comedor
DROP POLICY IF EXISTS "ver miembros de mi comedor" ON public.usuarios_comedor;
CREATE POLICY "ver miembros de mi comedor" ON public.usuarios_comedor
  FOR SELECT TO authenticated
  USING (public.can_view_comedor(comedor_id) OR user_id = auth.uid());

-- menus
DROP POLICY IF EXISTS "publico ve menus publicados" ON public.menus;
CREATE POLICY "publico ve menus publicados" ON public.menus
  FOR SELECT TO anon, authenticated
  USING (publicado = true OR public.can_view_comedor(comedor_id));

DROP POLICY IF EXISTS "socias gestionan menus" ON public.menus;
CREATE POLICY "socias ven menus" ON public.menus
  FOR SELECT TO authenticated
  USING (public.can_view_comedor(comedor_id));
CREATE POLICY "socias escriben menus" ON public.menus
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias actualizan menus" ON public.menus
  FOR UPDATE TO authenticated
  USING (public.can_write_comedor(comedor_id))
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias borran menus" ON public.menus
  FOR DELETE TO authenticated
  USING (public.can_write_comedor(comedor_id));

-- reservas
DROP POLICY IF EXISTS "socias ven reservas de su comedor" ON public.reservas;
CREATE POLICY "socias ven reservas de su comedor" ON public.reservas
  FOR SELECT TO authenticated
  USING (public.can_view_comedor(comedor_id));

DROP POLICY IF EXISTS "socias gestionan reservas" ON public.reservas;
CREATE POLICY "socias gestionan reservas" ON public.reservas
  FOR UPDATE TO authenticated
  USING (public.can_write_comedor(comedor_id));

DROP POLICY IF EXISTS "socias borran reservas" ON public.reservas;
CREATE POLICY "socias borran reservas" ON public.reservas
  FOR DELETE TO authenticated
  USING (public.can_write_comedor(comedor_id));

-- insumos
DROP POLICY IF EXISTS "socias gestionan insumos" ON public.insumos;
CREATE POLICY "socias ven insumos" ON public.insumos
  FOR SELECT TO authenticated
  USING (public.can_view_comedor(comedor_id));
CREATE POLICY "socias escriben insumos" ON public.insumos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias actualizan insumos" ON public.insumos
  FOR UPDATE TO authenticated
  USING (public.can_write_comedor(comedor_id))
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias borran insumos" ON public.insumos
  FOR DELETE TO authenticated
  USING (public.can_write_comedor(comedor_id));

-- movimientos_insumo
DROP POLICY IF EXISTS "socias gestionan movimientos" ON public.movimientos_insumo;
CREATE POLICY "socias ven movimientos" ON public.movimientos_insumo
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = insumo_id AND public.can_view_comedor(i.comedor_id)));
CREATE POLICY "socias escriben movimientos" ON public.movimientos_insumo
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = insumo_id AND public.can_write_comedor(i.comedor_id)));
CREATE POLICY "socias actualizan movimientos" ON public.movimientos_insumo
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = insumo_id AND public.can_write_comedor(i.comedor_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = insumo_id AND public.can_write_comedor(i.comedor_id)));
CREATE POLICY "socias borran movimientos" ON public.movimientos_insumo
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = insumo_id AND public.can_write_comedor(i.comedor_id)));

-- caja
DROP POLICY IF EXISTS "socias gestionan caja" ON public.caja_dias;
CREATE POLICY "socias ven caja" ON public.caja_dias
  FOR SELECT TO authenticated
  USING (public.can_view_comedor(comedor_id));
CREATE POLICY "socias escriben caja" ON public.caja_dias
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias actualizan caja" ON public.caja_dias
  FOR UPDATE TO authenticated
  USING (public.can_write_comedor(comedor_id))
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias borran caja" ON public.caja_dias
  FOR DELETE TO authenticated
  USING (public.can_write_comedor(comedor_id));

-- transacciones
DROP POLICY IF EXISTS "socias gestionan transacciones" ON public.transacciones;
CREATE POLICY "socias ven transacciones" ON public.transacciones
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.caja_dias c WHERE c.id = caja_dia_id AND public.can_view_comedor(c.comedor_id)));
CREATE POLICY "socias escriben transacciones" ON public.transacciones
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.caja_dias c WHERE c.id = caja_dia_id AND public.can_write_comedor(c.comedor_id)));
CREATE POLICY "socias actualizan transacciones" ON public.transacciones
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.caja_dias c WHERE c.id = caja_dia_id AND public.can_write_comedor(c.comedor_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.caja_dias c WHERE c.id = caja_dia_id AND public.can_write_comedor(c.comedor_id)));
CREATE POLICY "socias borran transacciones" ON public.transacciones
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.caja_dias c WHERE c.id = caja_dia_id AND public.can_write_comedor(c.comedor_id)));

-- padron
DROP POLICY IF EXISTS "socias gestionan padron" ON public.beneficiarios;
CREATE POLICY "socias ven padron" ON public.beneficiarios
  FOR SELECT TO authenticated
  USING (public.can_view_comedor(comedor_id));
CREATE POLICY "socias escriben padron" ON public.beneficiarios
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias actualizan padron" ON public.beneficiarios
  FOR UPDATE TO authenticated
  USING (public.can_write_comedor(comedor_id))
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias borran padron" ON public.beneficiarios
  FOR DELETE TO authenticated
  USING (public.can_write_comedor(comedor_id));

-- cronograma
DROP POLICY IF EXISTS "socias gestionan cronograma" ON public.cronograma;
CREATE POLICY "socias ven cronograma" ON public.cronograma
  FOR SELECT TO authenticated
  USING (public.can_view_comedor(comedor_id));
CREATE POLICY "socias escriben cronograma" ON public.cronograma
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias actualizan cronograma" ON public.cronograma
  FOR UPDATE TO authenticated
  USING (public.can_write_comedor(comedor_id))
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias borran cronograma" ON public.cronograma
  FOR DELETE TO authenticated
  USING (public.can_write_comedor(comedor_id));

-- campanas
DROP POLICY IF EXISTS "publico ve campanas activas" ON public.campanas;
CREATE POLICY "publico ve campanas activas" ON public.campanas
  FOR SELECT TO anon, authenticated
  USING (activa = true OR public.can_view_comedor(comedor_id));

DROP POLICY IF EXISTS "socias gestionan campanas" ON public.campanas;
CREATE POLICY "socias ven campanas" ON public.campanas
  FOR SELECT TO authenticated
  USING (public.can_view_comedor(comedor_id));
CREATE POLICY "socias escriben campanas" ON public.campanas
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias actualizan campanas" ON public.campanas
  FOR UPDATE TO authenticated
  USING (public.can_write_comedor(comedor_id))
  WITH CHECK (public.can_write_comedor(comedor_id));
CREATE POLICY "socias borran campanas" ON public.campanas
  FOR DELETE TO authenticated
  USING (public.can_write_comedor(comedor_id));

-- invitaciones: full supervisors can manage like presidenta
DROP POLICY IF EXISTS "Presidenta o admin gestionan invitaciones" ON public.invitaciones;
CREATE POLICY "Presidenta o admin gestionan invitaciones" ON public.invitaciones
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.is_full_supervisor_of(comedor_id)
  OR EXISTS (SELECT 1 FROM public.usuarios_comedor uc
             WHERE uc.comedor_id = invitaciones.comedor_id
               AND uc.user_id = auth.uid() AND uc.cargo = 'presidenta')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.is_full_supervisor_of(comedor_id)
  OR EXISTS (SELECT 1 FROM public.usuarios_comedor uc
             WHERE uc.comedor_id = invitaciones.comedor_id
               AND uc.user_id = auth.uid() AND uc.cargo = 'presidenta')
);

-- storage writes require write access
DROP POLICY IF EXISTS "Usuarias autenticadas suben fotos" ON storage.objects;
CREATE POLICY "Usuarias autenticadas suben fotos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'fotos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (
      (storage.foldername(name))[1] IN ('comedor', 'campanas')
      AND public.can_write_comedor(((storage.foldername(name))[2])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "Usuarias autenticadas actualizan sus fotos" ON storage.objects;
CREATE POLICY "Usuarias autenticadas actualizan sus fotos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'fotos' AND (
    owner = auth.uid()
    OR (
      (storage.foldername(name))[1] IN ('comedor', 'campanas')
      AND public.can_write_comedor(((storage.foldername(name))[2])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "Usuarias autenticadas borran sus fotos" ON storage.objects;
CREATE POLICY "Usuarias autenticadas borran sus fotos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'fotos' AND (
    owner = auth.uid()
    OR (
      (storage.foldername(name))[1] IN ('comedor', 'campanas')
      AND public.can_write_comedor(((storage.foldername(name))[2])::uuid)
    )
  )
);
