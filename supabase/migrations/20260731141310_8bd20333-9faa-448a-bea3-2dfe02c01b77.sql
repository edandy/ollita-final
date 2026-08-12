ALTER TABLE public.reservas ADD COLUMN IF NOT EXISTS comprobante_url text;
ALTER TABLE public.movimientos_insumo ADD COLUMN IF NOT EXISTS precio_unitario numeric;

CREATE POLICY "Comensales suben captura de pago"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'fotos' AND (storage.foldername(name))[1] = 'pagos');