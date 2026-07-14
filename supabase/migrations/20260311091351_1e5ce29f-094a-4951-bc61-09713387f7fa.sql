CREATE OR REPLACE FUNCTION public.update_farm_boundary(
  farm_id uuid,
  boundary_geojson text,
  lat numeric,
  lng numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE farms
  SET boundary = ST_GeomFromGeoJSON(boundary_geojson),
      latitude = lat,
      longitude = lng
  WHERE id = farm_id;
END;
$$;