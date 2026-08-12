
-- ============ ENUMS ============
CREATE TYPE comedor_tipo AS ENUM ('comedor','olla');
CREATE TYPE cargo_socia AS ENUM ('presidenta','tesorera','almacenera','socia');
CREATE TYPE reserva_estado AS ENUM ('pendiente','recogida','no_recogida');
CREATE TYPE insumo_unidad AS ENUM ('kg','L','unid');
CREATE TYPE insumo_origen AS ENUM ('municipalidad','comprado','donado');
CREATE TYPE movimiento_tipo AS ENUM ('ingreso','salida');
CREATE TYPE transaccion_tipo AS ENUM ('ingreso','egreso');
CREATE TYPE transaccion_categoria AS ENUM ('venta_menus','compra_frescos','gas','agua','luz','compra_insumos','actividad','otro');
CREATE TYPE beneficiario_categoria AS ENUM ('socia_familia','publico_recurrente','caso_social');
CREATE TYPE beneficiario_subtipo AS ENUM ('adulto_mayor','madre_soltera','otro');
CREATE TYPE campana_meta AS ENUM ('dinero','especie');

-- ============ UPDATED_AT HELPER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ COMEDORES ============
CREATE TABLE public.comedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo comedor_tipo NOT NULL DEFAULT 'comedor',
  descripcion TEXT,
  direccion TEXT NOT NULL,
  distrito TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  horario_inicio TIME NOT NULL DEFAULT '11:00',
  horario_fin TIME NOT NULL DEFAULT '13:00',
  dias_atencion TEXT[] NOT NULL DEFAULT ARRAY['lun','mar','mie','jue','vie'],
  telefono_whatsapp TEXT,
  raciones_diarias INTEGER NOT NULL DEFAULT 80,
  precio_menu NUMERIC(6,2) NOT NULL DEFAULT 2.50,
  yape_numero TEXT,
  yape_qr_url TEXT,
  foto_url TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.comedores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comedores TO authenticated;
GRANT ALL ON public.comedores TO service_role;
ALTER TABLE public.comedores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER tg_comedores_updated BEFORE UPDATE ON public.comedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USUARIOS_COMEDOR ============
CREATE TABLE public.usuarios_comedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comedor_id UUID NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  cargo cargo_socia NOT NULL DEFAULT 'socia',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, comedor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios_comedor TO authenticated;
GRANT ALL ON public.usuarios_comedor TO service_role;
ALTER TABLE public.usuarios_comedor ENABLE ROW LEVEL SECURITY;

-- Helper: ¿este user pertenece a este comedor?
CREATE OR REPLACE FUNCTION public.es_miembro_de(_comedor_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.usuarios_comedor
                WHERE user_id = auth.uid() AND comedor_id = _comedor_id)
$$;

-- Policies comedores
CREATE POLICY "publico ve comedores activos" ON public.comedores
  FOR SELECT TO anon, authenticated USING (activo = true OR public.es_miembro_de(id));
CREATE POLICY "socias actualizan su comedor" ON public.comedores
  FOR UPDATE TO authenticated USING (public.es_miembro_de(id)) WITH CHECK (public.es_miembro_de(id));
CREATE POLICY "cualquier autenticado crea comedor" ON public.comedores
  FOR INSERT TO authenticated WITH CHECK (true);

-- Policies usuarios_comedor
CREATE POLICY "ver miembros de mi comedor" ON public.usuarios_comedor
  FOR SELECT TO authenticated USING (public.es_miembro_de(comedor_id) OR user_id = auth.uid());
CREATE POLICY "registrar mi vinculo" ON public.usuarios_comedor
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "actualizar mi vinculo" ON public.usuarios_comedor
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.es_miembro_de(comedor_id));
CREATE POLICY "eliminar mi vinculo" ON public.usuarios_comedor
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.es_miembro_de(comedor_id));

-- ============ MENUS ============
CREATE TABLE public.menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comedor_id UUID NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  nombre_plato TEXT NOT NULL,
  descripcion TEXT,
  precio NUMERIC(6,2) NOT NULL,
  publicado BOOLEAN NOT NULL DEFAULT true,
  raciones_disponibles INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comedor_id, fecha)
);
GRANT SELECT ON public.menus TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menus TO authenticated;
GRANT ALL ON public.menus TO service_role;
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER tg_menus_updated BEFORE UPDATE ON public.menus
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "publico ve menus publicados" ON public.menus
  FOR SELECT TO anon, authenticated USING (publicado = true OR public.es_miembro_de(comedor_id));
CREATE POLICY "socias gestionan menus" ON public.menus
  FOR ALL TO authenticated USING (public.es_miembro_de(comedor_id)) WITH CHECK (public.es_miembro_de(comedor_id));

-- ============ RESERVAS ============
CREATE TABLE public.reservas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id UUID NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  comedor_id UUID NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre_comensal TEXT NOT NULL,
  telefono TEXT NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad BETWEEN 1 AND 5),
  estado reserva_estado NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reservas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservas TO authenticated;
GRANT ALL ON public.reservas TO service_role;
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;
-- visibles solo para socias del comedor (privacidad de datos personales)
CREATE POLICY "socias ven reservas de su comedor" ON public.reservas
  FOR SELECT TO authenticated USING (public.es_miembro_de(comedor_id));
CREATE POLICY "cualquiera crea una reserva" ON public.reservas
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "socias gestionan reservas" ON public.reservas
  FOR UPDATE TO authenticated USING (public.es_miembro_de(comedor_id));
CREATE POLICY "socias borran reservas" ON public.reservas
  FOR DELETE TO authenticated USING (public.es_miembro_de(comedor_id));

-- Trigger: descontar raciones al crear reserva
CREATE OR REPLACE FUNCTION public.descontar_raciones()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE disp INTEGER;
BEGIN
  SELECT raciones_disponibles INTO disp FROM public.menus WHERE id = NEW.menu_id FOR UPDATE;
  IF disp IS NULL OR disp < NEW.cantidad THEN
    RAISE EXCEPTION 'No hay suficientes raciones disponibles';
  END IF;
  UPDATE public.menus SET raciones_disponibles = raciones_disponibles - NEW.cantidad
    WHERE id = NEW.menu_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER tg_reservas_descontar BEFORE INSERT ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.descontar_raciones();

-- ============ INSUMOS ============
CREATE TABLE public.insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comedor_id UUID NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  unidad insumo_unidad NOT NULL DEFAULT 'kg',
  stock_actual NUMERIC(10,2) NOT NULL DEFAULT 0,
  consumo_diario_promedio NUMERIC(10,2) NOT NULL DEFAULT 1,
  precio_referencial NUMERIC(10,2),
  origen insumo_origen NOT NULL DEFAULT 'comprado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insumos TO authenticated;
GRANT ALL ON public.insumos TO service_role;
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER tg_insumos_updated BEFORE UPDATE ON public.insumos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "socias gestionan insumos" ON public.insumos
  FOR ALL TO authenticated USING (public.es_miembro_de(comedor_id)) WITH CHECK (public.es_miembro_de(comedor_id));

CREATE TABLE public.movimientos_insumo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id UUID NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  tipo movimiento_tipo NOT NULL,
  cantidad NUMERIC(10,2) NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_insumo TO authenticated;
GRANT ALL ON public.movimientos_insumo TO service_role;
ALTER TABLE public.movimientos_insumo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "socias gestionan movimientos" ON public.movimientos_insumo
  FOR ALL TO authenticated USING (
    EXISTS(SELECT 1 FROM public.insumos i WHERE i.id = insumo_id AND public.es_miembro_de(i.comedor_id))
  ) WITH CHECK (
    EXISTS(SELECT 1 FROM public.insumos i WHERE i.id = insumo_id AND public.es_miembro_de(i.comedor_id))
  );

-- ============ CAJA ============
CREATE TABLE public.caja_dias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comedor_id UUID NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  capital_inicial NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_ingresos NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_egresos NUMERIC(10,2) NOT NULL DEFAULT 0,
  ganancia NUMERIC(10,2) NOT NULL DEFAULT 0,
  cerrado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comedor_id, fecha)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caja_dias TO authenticated;
GRANT ALL ON public.caja_dias TO service_role;
ALTER TABLE public.caja_dias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "socias gestionan caja" ON public.caja_dias
  FOR ALL TO authenticated USING (public.es_miembro_de(comedor_id)) WITH CHECK (public.es_miembro_de(comedor_id));

CREATE TABLE public.transacciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_dia_id UUID NOT NULL REFERENCES public.caja_dias(id) ON DELETE CASCADE,
  tipo transaccion_tipo NOT NULL,
  categoria transaccion_categoria NOT NULL,
  monto NUMERIC(10,2) NOT NULL,
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transacciones TO authenticated;
GRANT ALL ON public.transacciones TO service_role;
ALTER TABLE public.transacciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "socias gestionan transacciones" ON public.transacciones
  FOR ALL TO authenticated USING (
    EXISTS(SELECT 1 FROM public.caja_dias c WHERE c.id = caja_dia_id AND public.es_miembro_de(c.comedor_id))
  ) WITH CHECK (
    EXISTS(SELECT 1 FROM public.caja_dias c WHERE c.id = caja_dia_id AND public.es_miembro_de(c.comedor_id))
  );

-- ============ BENEFICIARIOS ============
CREATE TABLE public.beneficiarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comedor_id UUID NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  nombre_completo TEXT NOT NULL,
  dni TEXT NOT NULL CHECK (dni ~ '^[0-9]{8}$'),
  categoria beneficiario_categoria NOT NULL,
  subtipo_caso_social beneficiario_subtipo,
  vigencia_hasta DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comedor_id, dni)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiarios TO authenticated;
GRANT ALL ON public.beneficiarios TO service_role;
ALTER TABLE public.beneficiarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "socias gestionan padron" ON public.beneficiarios
  FOR ALL TO authenticated USING (public.es_miembro_de(comedor_id)) WITH CHECK (public.es_miembro_de(comedor_id));

-- ============ CRONOGRAMA ============
CREATE TABLE public.cronograma (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comedor_id UUID NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  socias TEXT[] NOT NULL DEFAULT '{}',
  directiva_de_turno TEXT,
  notas TEXT,
  UNIQUE(comedor_id, fecha)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma TO authenticated;
GRANT ALL ON public.cronograma TO service_role;
ALTER TABLE public.cronograma ENABLE ROW LEVEL SECURITY;
CREATE POLICY "socias gestionan cronograma" ON public.cronograma
  FOR ALL TO authenticated USING (public.es_miembro_de(comedor_id)) WITH CHECK (public.es_miembro_de(comedor_id));

-- ============ CAMPANAS ============
CREATE TABLE public.campanas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comedor_id UUID NOT NULL REFERENCES public.comedores(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo_meta campana_meta NOT NULL DEFAULT 'dinero',
  meta_monto NUMERIC(10,2),
  meta_descripcion TEXT,
  avance_monto NUMERIC(10,2) NOT NULL DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT true,
  foto_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.campanas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanas TO authenticated;
GRANT ALL ON public.campanas TO service_role;
ALTER TABLE public.campanas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "publico ve campanas activas" ON public.campanas
  FOR SELECT TO anon, authenticated USING (activa = true OR public.es_miembro_de(comedor_id));
CREATE POLICY "socias gestionan campanas" ON public.campanas
  FOR ALL TO authenticated USING (public.es_miembro_de(comedor_id)) WITH CHECK (public.es_miembro_de(comedor_id));
