-- 1) Make soil-tests bucket private (if it exists)
UPDATE storage.buckets SET public = false WHERE id = 'soil-tests';

-- Ensure RLS policies on storage.objects scope soil-tests access to owners (folder = user id)
DROP POLICY IF EXISTS "Users can read their own soil test files" ON storage.objects;
CREATE POLICY "Users can read their own soil test files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'soil-tests' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can upload their own soil test files" ON storage.objects;
CREATE POLICY "Users can upload their own soil test files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'soil-tests' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update their own soil test files" ON storage.objects;
CREATE POLICY "Users can update their own soil test files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'soil-tests' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete their own soil test files" ON storage.objects;
CREATE POLICY "Users can delete their own soil test files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'soil-tests' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 2) Tighten weather_alerts policies — remove overly permissive INSERT/UPDATE
DROP POLICY IF EXISTS "System can insert weather alerts" ON public.weather_alerts;
DROP POLICY IF EXISTS "System can update weather alerts" ON public.weather_alerts;

-- Only admins (signed in) may insert/update from the API; the service role
-- used by edge functions and cron jobs bypasses RLS automatically.
CREATE POLICY "Admins can insert weather alerts"
ON public.weather_alerts FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update weather alerts"
ON public.weather_alerts FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));