-- Restore Data API grants lost when tables were recreated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comedores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios_comedor TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favoritos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menus TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insumos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_insumo TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caja_dias TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transacciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanas TO authenticated;

-- Public (anonymous) access where policies allow it
GRANT SELECT ON public.comedores TO anon;
GRANT SELECT ON public.menus TO anon;
GRANT SELECT ON public.campanas TO anon;
GRANT INSERT ON public.reservas TO anon;

-- Service role full access
GRANT ALL ON public.comedores, public.usuarios_comedor, public.clientes, public.favoritos, public.menus, public.reservas, public.beneficiarios, public.insumos, public.movimientos_insumo, public.caja_dias, public.transacciones, public.cronograma, public.campanas TO service_role;