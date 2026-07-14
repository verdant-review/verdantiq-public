
-- whatsapp_sessions: add owner-scoped write policies
CREATE POLICY "Users can insert their own whatsapp session"
ON public.whatsapp_sessions
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own whatsapp session"
ON public.whatsapp_sessions
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own whatsapp session"
ON public.whatsapp_sessions
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- farm_reports: add owner-scoped write policies
CREATE POLICY "Farmers can insert reports for their farms"
ON public.farm_reports
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = farm_reports.farm_id AND f.user_id = auth.uid()
));

CREATE POLICY "Farmers can update reports for their farms"
ON public.farm_reports
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = farm_reports.farm_id AND f.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = farm_reports.farm_id AND f.user_id = auth.uid()
));

CREATE POLICY "Farmers can delete reports for their farms"
ON public.farm_reports
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = farm_reports.farm_id AND f.user_id = auth.uid()
));

-- satellite_imagery: replace permissive insert policy with owner-scoped one
DROP POLICY IF EXISTS "System can insert satellite imagery" ON public.satellite_imagery;

CREATE POLICY "Farmers can insert satellite imagery for their farms"
ON public.satellite_imagery
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = satellite_imagery.farm_id AND f.user_id = auth.uid()
));
