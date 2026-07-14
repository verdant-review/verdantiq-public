
CREATE POLICY "kb-sources admin read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kb-sources' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "kb-sources admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kb-sources' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "kb-sources admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'kb-sources' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'kb-sources' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "kb-sources admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kb-sources' AND public.has_role(auth.uid(), 'admin'));

REVOKE EXECUTE ON FUNCTION public.match_kb_chunks(vector, integer, text, text, text, double precision) FROM PUBLIC, anon;
