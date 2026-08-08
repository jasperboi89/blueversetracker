CREATE POLICY "IS manuals owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'is-manuals' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "IS manuals owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'is-manuals' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "IS manuals owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'is-manuals' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'is-manuals' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "IS manuals owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'is-manuals' AND auth.uid()::text = (storage.foldername(name))[1]);