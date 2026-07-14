-- 1. AGROECOLOGICAL ZONES
CREATE TABLE public.agroecological_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code text NOT NULL UNIQUE,
  region_name text NOT NULL,
  rainfall_min_mm integer,
  rainfall_max_mm integer,
  description text,
  recommended_crops jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_cover_crops jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_agroforestry jsonb NOT NULL DEFAULT '[]'::jsonb,
  typical_soil_constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  geometry geometry(MultiPolygon, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_zones_geometry ON public.agroecological_zones USING GIST(geometry);
ALTER TABLE public.agroecological_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zones are publicly readable" ON public.agroecological_zones FOR SELECT USING (true);
CREATE POLICY "Admins manage zones" ON public.agroecological_zones FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.agroecological_zones (region_code, region_name, rainfall_min_mm, rainfall_max_mm, description, recommended_crops, recommended_cover_crops, recommended_agroforestry, typical_soil_constraints) VALUES
('NR_I',  'Natural Region I (Specialised & Diversified)',     1000, 2000, 'High rainfall, eastern highlands.', '["tea","coffee","macadamia","deciduous fruits","potatoes","dairy"]'::jsonb, '["lablab","mucuna","crotalaria","oats"]'::jsonb, '["grevillea","calliandra","leucaena"]'::jsonb, '["acidic soils","leaching","steep slopes"]'::jsonb),
('NR_II', 'Natural Region II (Intensive Farming)',             750, 1000, 'Reliable rainfall. Prime maize/tobacco belt.', '["maize","tobacco","soybean","wheat","cotton","groundnut"]'::jsonb, '["sunnhemp","mucuna","cowpea","velvet bean"]'::jsonb, '["faidherbia albida","msasa","gliricidia"]'::jsonb, '["compaction","sub-soil acidity","P-fixation"]'::jsonb),
('NR_III','Natural Region III (Semi-Intensive Farming)',       650,  800, 'Mid-season dry spells. Drought-tolerant crops.', '["maize (early-maturing)","sorghum","cotton","groundnut","sunflower","cattle"]'::jsonb, '["cowpea","pigeonpea","mucuna"]'::jsonb, '["acacia","faidherbia","moringa"]'::jsonb, '["sandy soils","low organic matter","drought stress"]'::jsonb),
('NR_IV', 'Natural Region IV (Semi-Extensive Farming)',        450,  650, 'Low erratic rainfall. Small grains + livestock.', '["sorghum","pearl millet","finger millet","cowpea","groundnut","goats","cattle"]'::jsonb, '["cowpea","pigeonpea","lablab"]'::jsonb, '["acacia","faidherbia","prosopis","baobab"]'::jsonb, '["very sandy","very low OM","high erosion"]'::jsonb),
('NR_V_A','Natural Region Va (Extensive - Northern)',          300,  450, 'Very low rainfall, ranching.', '["pearl millet","sorghum","cattle","goats"]'::jsonb, '["cowpea","lablab"]'::jsonb, '["acacia","mopane","baobab"]'::jsonb, '["extreme drought","sodic patches"]'::jsonb),
('NR_V_B','Natural Region Vb (Extensive - Lowveld)',           200,  450, 'Hot lowveld, irrigation-dependent.', '["sugarcane (irrigated)","citrus","cattle","game"]'::jsonb, '["cowpea","lablab"]'::jsonb, '["mopane","acacia","baobab"]'::jsonb, '["heat stress","salinity risk"]'::jsonb);

-- 2. ENUMS + EXTEND soil_tests
DO $$ BEGIN CREATE TYPE public.soil_confidence_level AS ENUM ('low','medium','high','validated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.soil_data_source AS ENUM ('estimated','self_reported','lab_uploaded','officer_entry'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.soil_tests
  ADD COLUMN IF NOT EXISTS farm_id uuid,
  ADD COLUMN IF NOT EXISTS cec numeric,
  ADD COLUMN IF NOT EXISTS ec numeric,
  ADD COLUMN IF NOT EXISTS zinc numeric,
  ADD COLUMN IF NOT EXISTS boron numeric,
  ADD COLUMN IF NOT EXISTS sulphur numeric,
  ADD COLUMN IF NOT EXISTS sand_pct numeric,
  ADD COLUMN IF NOT EXISTS silt_pct numeric,
  ADD COLUMN IF NOT EXISTS clay_pct numeric,
  ADD COLUMN IF NOT EXISTS bulk_density numeric,
  ADD COLUMN IF NOT EXISTS organic_carbon numeric,
  ADD COLUMN IF NOT EXISTS parent_material text,
  ADD COLUMN IF NOT EXISTS slope_pct numeric,
  ADD COLUMN IF NOT EXISTS drainage_class text,
  ADD COLUMN IF NOT EXISTS erosion_risk text,
  ADD COLUMN IF NOT EXISTS biological_activity_score numeric,
  ADD COLUMN IF NOT EXISTS confidence_level public.soil_confidence_level NOT NULL DEFAULT 'high',
  ADD COLUMN IF NOT EXISTS source public.soil_data_source NOT NULL DEFAULT 'lab_uploaded';
CREATE INDEX IF NOT EXISTS idx_soil_tests_farm ON public.soil_tests(farm_id);

-- 3. SOIL BASELINE
CREATE TABLE public.soil_baseline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL UNIQUE,
  ph numeric,
  organic_carbon_g_per_kg numeric,
  cec_cmol_per_kg numeric,
  clay_pct numeric,
  sand_pct numeric,
  silt_pct numeric,
  bulk_density_kg_per_m3 numeric,
  nitrogen_g_per_kg numeric,
  source text NOT NULL DEFAULT 'soilgrids-isric',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  raw_response jsonb
);
ALTER TABLE public.soil_baseline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Farmers view own soil baseline" ON public.soil_baseline FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.farms f WHERE f.id = soil_baseline.farm_id AND f.user_id = auth.uid()));
CREATE POLICY "Admins view all soil baseline" ON public.soil_baseline FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Farmers insert own soil baseline" ON public.soil_baseline FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.farms f WHERE f.id = soil_baseline.farm_id AND f.user_id = auth.uid()));
CREATE POLICY "Admins manage soil baseline" ON public.soil_baseline FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 4. SOIL SELF ASSESSMENTS
CREATE TABLE public.soil_self_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL,
  field_name text,
  soil_colour text,
  texture_by_feel text,
  slope_class text,
  drainage_class text,
  erosion_observed text,
  residue_management text,
  last_manure_application_date date,
  last_compost_application_date date,
  notes text,
  assessed_by uuid,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_self_assess_farm ON public.soil_self_assessments(farm_id, assessed_at DESC);
ALTER TABLE public.soil_self_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Farmers manage own self-assessments" ON public.soil_self_assessments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.farms f WHERE f.id = soil_self_assessments.farm_id AND f.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.farms f WHERE f.id = soil_self_assessments.farm_id AND f.user_id = auth.uid()));
CREATE POLICY "Admins view all self-assessments" ON public.soil_self_assessments FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 5. FARM PRACTICES
CREATE TABLE public.farm_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL,
  season text NOT NULL,
  cover_crops text[] DEFAULT '{}',
  rotation_sequence text[] DEFAULT '{}',
  intercrops jsonb DEFAULT '[]'::jsonb,
  agroforestry_species text[] DEFAULT '{}',
  conservation_ag_methods text[] DEFAULT '{}',
  organic_inputs jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  adoption_score numeric GENERATED ALWAYS AS (
    LEAST(100,
      (CASE WHEN array_length(cover_crops, 1) > 0 THEN 20 ELSE 0 END) +
      (CASE WHEN array_length(rotation_sequence, 1) >= 2 THEN 20 ELSE 0 END) +
      (CASE WHEN jsonb_array_length(COALESCE(intercrops, '[]'::jsonb)) > 0 THEN 15 ELSE 0 END) +
      (CASE WHEN array_length(agroforestry_species, 1) > 0 THEN 15 ELSE 0 END) +
      (CASE WHEN array_length(conservation_ag_methods, 1) > 0 THEN 15 ELSE 0 END) +
      (CASE WHEN jsonb_array_length(COALESCE(organic_inputs, '[]'::jsonb)) > 0 THEN 15 ELSE 0 END)
    )
  ) STORED,
  UNIQUE(farm_id, season)
);
CREATE INDEX idx_practices_farm ON public.farm_practices(farm_id, season DESC);
ALTER TABLE public.farm_practices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Farmers manage own practices" ON public.farm_practices FOR ALL
  USING (EXISTS (SELECT 1 FROM public.farms f WHERE f.id = farm_practices.farm_id AND f.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.farms f WHERE f.id = farm_practices.farm_id AND f.user_id = auth.uid()));
CREATE POLICY "Admins view all practices" ON public.farm_practices FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_farm_practices_updated_at
  BEFORE UPDATE ON public.farm_practices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. EXTEND farms
ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS agroecological_zone_id uuid REFERENCES public.agroecological_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS soil_confidence public.soil_confidence_level NOT NULL DEFAULT 'low';

-- 7. AUTO-ASSIGN ZONE TRIGGER
CREATE OR REPLACE FUNCTION public.assign_agroecological_zone()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE zone_id uuid; centroid geometry;
BEGIN
  IF NEW.boundary IS NOT NULL THEN
    centroid := ST_Centroid(NEW.boundary);
  ELSIF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    centroid := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  ELSE
    RETURN NEW;
  END IF;
  SELECT id INTO zone_id FROM public.agroecological_zones
    WHERE geometry IS NOT NULL AND ST_Contains(geometry, centroid) LIMIT 1;
  IF zone_id IS NOT NULL THEN NEW.agroecological_zone_id := zone_id; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_assign_zone ON public.farms;
CREATE TRIGGER trg_assign_zone
  BEFORE INSERT OR UPDATE OF boundary, latitude, longitude ON public.farms
  FOR EACH ROW EXECUTE FUNCTION public.assign_agroecological_zone();

-- 8. SOIL HEALTH CARD VIEW
CREATE OR REPLACE VIEW public.soil_health_cards
WITH (security_invoker = true) AS
SELECT
  f.id AS farm_id, f.user_id, f.name AS farm_name,
  f.agroecological_zone_id, z.region_code, z.region_name,
  (SELECT row_to_json(t) FROM (
     SELECT id, test_date, ph_level, nitrogen, phosphorus, potassium, organic_matter,
            cec, ec, zinc, boron, sulphur, sand_pct, silt_pct, clay_pct,
            bulk_density, organic_carbon, biological_activity_score,
            confidence_level, source, recommendations
     FROM public.soil_tests st WHERE st.farm_id = f.id
     ORDER BY st.test_date DESC NULLS LAST, st.created_at DESC LIMIT 1
  ) t) AS latest_lab,
  (SELECT row_to_json(s) FROM (
     SELECT id, soil_colour, texture_by_feel, slope_class, drainage_class,
            erosion_observed, residue_management, last_manure_application_date, assessed_at
     FROM public.soil_self_assessments sa WHERE sa.farm_id = f.id
     ORDER BY sa.assessed_at DESC LIMIT 1
  ) s) AS latest_self_assessment,
  (SELECT row_to_json(b) FROM (
     SELECT ph, organic_carbon_g_per_kg, cec_cmol_per_kg, clay_pct, sand_pct, silt_pct,
            bulk_density_kg_per_m3, nitrogen_g_per_kg, fetched_at
     FROM public.soil_baseline sb WHERE sb.farm_id = f.id LIMIT 1
  ) b) AS baseline,
  f.soil_confidence,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.soil_tests st WHERE st.farm_id = f.id AND st.ph_level BETWEEN 6.0 AND 7.0 AND st.organic_matter >= 3) THEN 'A'
    WHEN EXISTS (SELECT 1 FROM public.soil_tests st WHERE st.farm_id = f.id AND st.ph_level BETWEEN 5.5 AND 7.5 AND st.organic_matter >= 2) THEN 'B'
    WHEN EXISTS (SELECT 1 FROM public.soil_tests st WHERE st.farm_id = f.id) THEN 'C'
    WHEN EXISTS (SELECT 1 FROM public.soil_baseline sb WHERE sb.farm_id = f.id AND sb.ph >= 5.5) THEN 'D'
    ELSE 'E'
  END AS health_grade
FROM public.farms f
LEFT JOIN public.agroecological_zones z ON z.id = f.agroecological_zone_id;