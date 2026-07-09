DROP POLICY IF EXISTS "own blobs" ON public.user_store_blobs;
CREATE POLICY "own blobs select" ON public.user_store_blobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own blobs insert" ON public.user_store_blobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own blobs update" ON public.user_store_blobs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own blobs delete" ON public.user_store_blobs FOR DELETE USING (auth.uid() = user_id);