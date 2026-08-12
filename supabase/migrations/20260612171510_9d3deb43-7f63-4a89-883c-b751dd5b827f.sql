CREATE POLICY "Lectura pública de fotos" ON storage.objects FOR SELECT USING (bucket_id = 'fotos');
CREATE POLICY "Usuarias autenticadas suben fotos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fotos');
CREATE POLICY "Usuarias autenticadas actualizan sus fotos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'fotos' AND owner = auth.uid());
CREATE POLICY "Usuarias autenticadas borran sus fotos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'fotos' AND owner = auth.uid());