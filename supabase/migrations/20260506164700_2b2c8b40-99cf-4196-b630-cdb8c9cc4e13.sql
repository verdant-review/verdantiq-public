-- View: national NDVI daily averages, joined with agroecological zone
CREATE OR REPLACE VIEW public.v_national_ndvi_daily AS
SELECT
  date_trunc('day', s.captured_at)::date AS day,
  z.region_code,
  z.region_name,
  AVG(s.ndvi_value)::numeric(6,4) AS avg_ndvi,
  COUNT(*)::int AS sample_count
FROM public.satellite_imagery s
JOIN public.farms f ON f.id = s.farm_id
LEFT JOIN public.agroecological_zones z ON z.id = f.agroecological_zone_id
WHERE s.captured_at >= now() - interval '120 days'
  AND s.ndvi_value IS NOT NULL
GROUP BY 1, z.region_code, z.region_name;

GRANT SELECT ON public.v_national_ndvi_daily TO anon, authenticated;

-- RPC: zones as GeoJSON FeatureCollection
CREATE OR REPLACE FUNCTION public.get_zones_geojson()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'id', z.id,
        'geometry', ST_AsGeoJSON(z.geometry)::jsonb,
        'properties', jsonb_build_object(
          'region_code', z.region_code,
          'region_name', z.region_name,
          'rainfall_min_mm', z.rainfall_min_mm,
          'rainfall_max_mm', z.rainfall_max_mm,
          'description', z.description
        )
      )
    ), '[]'::jsonb)
  )
  FROM public.agroecological_zones z
  WHERE z.geometry IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_zones_geojson() TO anon, authenticated;

-- RPC: latest NDVI per farm (for national map)
CREATE OR REPLACE FUNCTION public.get_latest_farm_ndvi()
RETURNS TABLE (
  farm_id uuid,
  farm_name text,
  latitude numeric,
  longitude numeric,
  region_code text,
  region_name text,
  ndvi_value numeric,
  captured_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (f.id)
    f.id AS farm_id,
    f.name AS farm_name,
    f.latitude,
    f.longitude,
    z.region_code,
    z.region_name,
    s.ndvi_value,
    s.captured_at
  FROM public.farms f
  LEFT JOIN public.satellite_imagery s ON s.farm_id = f.id AND s.ndvi_value IS NOT NULL
  LEFT JOIN public.agroecological_zones z ON z.id = f.agroecological_zone_id
  WHERE f.latitude IS NOT NULL AND f.longitude IS NOT NULL
  ORDER BY f.id, s.captured_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_farm_ndvi() TO anon, authenticated;