
CREATE OR REPLACE FUNCTION public.get_farm_boundary_geojson(_farm_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT ST_AsGeoJSON(boundary)::jsonb
  INTO result
  FROM public.farms
  WHERE id = _farm_id
    AND (user_id = auth.uid() OR public.is_admin(auth.uid()));

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_farm_boundary_geojson(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_farm_boundary_geojson(UUID) TO authenticated;
