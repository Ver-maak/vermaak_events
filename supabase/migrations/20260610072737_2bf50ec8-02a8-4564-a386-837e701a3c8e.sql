
CREATE POLICY "Event covers are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-covers');

CREATE POLICY "Authenticated users can upload event covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'event-covers');

CREATE POLICY "Users can update their own event covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'event-covers' AND owner = auth.uid());

CREATE POLICY "Users can delete their own event covers"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'event-covers' AND owner = auth.uid());
