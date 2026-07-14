UPDATE public.agroecological_zones SET geometry = ST_Multi(ST_GeomFromText('POLYGON((32.6 -17.8, 33.1 -17.8, 33.1 -20.5, 32.6 -20.5, 32.6 -17.8))', 4326)) WHERE region_code = 'NR_I';
UPDATE public.agroecological_zones SET geometry = ST_Multi(ST_GeomFromText('POLYGON((29.5 -16.8, 32.6 -16.8, 32.6 -19.0, 29.5 -19.0, 29.5 -16.8))', 4326)) WHERE region_code = 'NR_II';
UPDATE public.agroecological_zones SET geometry = ST_Multi(ST_GeomFromText('POLYGON((28.5 -19.0, 32.6 -19.0, 32.6 -20.2, 28.5 -20.2, 28.5 -19.0))', 4326)) WHERE region_code = 'NR_III';
UPDATE public.agroecological_zones SET geometry = ST_Multi(ST_GeomFromText('POLYGON((26.5 -18.5, 28.5 -18.5, 28.5 -21.5, 26.5 -21.5, 26.5 -18.5))', 4326)) WHERE region_code = 'NR_IV';
UPDATE public.agroecological_zones SET geometry = ST_Multi(ST_GeomFromText('POLYGON((25.5 -15.6, 32.0 -15.6, 32.0 -16.8, 25.5 -16.8, 25.5 -15.6))', 4326)) WHERE region_code = 'NR_V_A';
UPDATE public.agroecological_zones SET geometry = ST_Multi(ST_GeomFromText('POLYGON((28.0 -20.5, 33.0 -20.5, 33.0 -22.5, 28.0 -22.5, 28.0 -20.5))', 4326)) WHERE region_code = 'NR_V_B';

CREATE INDEX IF NOT EXISTS idx_agroecological_zones_geometry ON public.agroecological_zones USING GIST (geometry);

UPDATE public.farms f
SET agroecological_zone_id = z.id
FROM public.agroecological_zones z
WHERE z.geometry IS NOT NULL
  AND (
    (f.boundary IS NOT NULL AND ST_Intersects(f.boundary, z.geometry))
    OR (f.boundary IS NULL AND f.latitude IS NOT NULL AND f.longitude IS NOT NULL
        AND ST_Intersects(z.geometry, ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326)))
  );