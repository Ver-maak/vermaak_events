ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS logo_url text;
CREATE POLICY "Paylink logos public read" ON storage.objects FOR SELECT USING (bucket_id = 'paylink-logos');
CREATE POLICY "Paylink logos user upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'paylink-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Paylink logos user delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'paylink-logos' AND (storage.foldername(name))[1] = auth.uid()::text);