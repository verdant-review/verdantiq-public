UPDATE public.farms f
SET farming_type = p.farming_type
FROM public.profiles p
WHERE f.user_id = p.id
  AND p.farming_type IS NOT NULL
  AND f.farming_type IS DISTINCT FROM p.farming_type;