
CREATE TABLE public.farm_polygons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL,
  agromonitoring_polygon_id TEXT NOT NULL,
  area_ha NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (farm_id)
);

CREATE INDEX idx_farm_polygons_farm_id ON public.farm_polygons(farm_id);

ALTER TABLE public.farm_polygons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farmers manage their own farm polygons"
ON public.farm_polygons
FOR ALL
USING (EXISTS (SELECT 1 FROM public.farms f WHERE f.id = farm_polygons.farm_id AND f.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.farms f WHERE f.id = farm_polygons.farm_id AND f.user_id = auth.uid()));

CREATE POLICY "Admins view all farm polygons"
ON public.farm_polygons
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

ALTER TABLE public.satellite_imagery
  ADD COLUMN IF NOT EXISTS image_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cloud_cover_pct NUMERIC;
