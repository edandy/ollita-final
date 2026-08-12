
CREATE OR REPLACE FUNCTION public.comedor_tiene_miembros(_comedor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.usuarios_comedor WHERE comedor_id = _comedor_id)
$$;
REVOKE EXECUTE ON FUNCTION public.comedor_tiene_miembros(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comedor_tiene_miembros(uuid) TO authenticated;

DROP POLICY IF EXISTS "registrar mi vinculo" ON public.usuarios_comedor;
CREATE POLICY "registrar fundadora" ON public.usuarios_comedor
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND NOT public.comedor_tiene_miembros(comedor_id)
);

DROP POLICY IF EXISTS "cualquiera crea una reserva" ON public.reservas;
CREATE POLICY "cualquiera crea una reserva" ON public.reservas
FOR INSERT TO anon, authenticated
WITH CHECK (
  cantidad > 0
  AND EXISTS (
    SELECT 1 FROM public.menus m
    WHERE m.id = reservas.menu_id
      AND m.comedor_id = reservas.comedor_id
      AND m.publicado = true
      AND m.fecha >= CURRENT_DATE
  )
);

DROP POLICY IF EXISTS "Usuarias autenticadas suben fotos" ON storage.objects;
CREATE POLICY "Usuarias autenticadas suben fotos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fotos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (
      (storage.foldername(name))[1] IN ('comedor','campanas')
      AND public.es_miembro_de(((storage.foldername(name))[2])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "Usuarias autenticadas actualizan sus fotos" ON storage.objects;
CREATE POLICY "Usuarias autenticadas actualizan sus fotos" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'fotos' AND (
    owner = auth.uid()
    OR (
      (storage.foldername(name))[1] IN ('comedor','campanas')
      AND public.es_miembro_de(((storage.foldername(name))[2])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "Usuarias autenticadas borran sus fotos" ON storage.objects;
CREATE POLICY "Usuarias autenticadas borran sus fotos" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'fotos' AND (
    owner = auth.uid()
    OR (
      (storage.foldername(name))[1] IN ('comedor','campanas')
      AND public.es_miembro_de(((storage.foldername(name))[2])::uuid)
    )
  )
);
