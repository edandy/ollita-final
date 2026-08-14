-- Asegura bucket "fotos" + policies que usa la app (subirFoto).
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fotos',
  'fotos',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Limpia policies viejas del bucket fotos
DROP POLICY IF EXISTS "Lectura pública de fotos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarias autenticadas suben fotos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarias autenticadas actualizan sus fotos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarias autenticadas borran sus fotos" ON storage.objects;
DROP POLICY IF EXISTS "Comensales suben captura de pago" ON storage.objects;

-- Lectura (necesaria para createSignedUrl)
CREATE POLICY "Lectura pública de fotos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'fotos');

-- Subida panel: carpeta propia del user O comedor/{uuid}/... O campanas/{uuid}/...
CREATE POLICY "Usuarias autenticadas suben fotos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'fotos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (
      (storage.foldername(name))[1] IN ('comedor', 'campanas')
      AND public.es_miembro_de(((storage.foldername(name))[2])::uuid)
    )
  )
);

CREATE POLICY "Usuarias autenticadas actualizan sus fotos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'fotos' AND (
    owner = auth.uid()
    OR (
      (storage.foldername(name))[1] IN ('comedor', 'campanas')
      AND public.es_miembro_de(((storage.foldername(name))[2])::uuid)
    )
  )
);

CREATE POLICY "Usuarias autenticadas borran sus fotos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'fotos' AND (
    owner = auth.uid()
    OR (
      (storage.foldername(name))[1] IN ('comedor', 'campanas')
      AND public.es_miembro_de(((storage.foldername(name))[2])::uuid)
    )
  )
);

-- Subida pública de comprobantes de reserva → pagos/...
CREATE POLICY "Comensales suben captura de pago"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'fotos'
  AND (storage.foldername(name))[1] = 'pagos'
);
