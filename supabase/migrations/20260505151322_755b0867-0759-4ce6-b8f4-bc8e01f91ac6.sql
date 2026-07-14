-- 1. Backfill: ensure any existing profiles.is_admin=true users have an admin role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM public.profiles
WHERE is_admin = true
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Rewrite is_admin() to rely solely on user_roles
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(auth.uid());
$$;

-- 3. Lock down profile self-update so is_admin can never be set to true
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND is_admin = false
);

-- 4. Restrict logistics_providers contact data to logistics/admin only
DROP POLICY IF EXISTS "Authenticated can view providers" ON public.logistics_providers;

CREATE POLICY "Logistics and admins can view full provider details"
ON public.logistics_providers
FOR SELECT
TO authenticated
USING (public.is_logistics_or_admin());

-- Safe view exposing only non-sensitive columns to all authenticated users
CREATE OR REPLACE VIEW public.logistics_providers_public
WITH (security_invoker = true)
AS
SELECT id, name, region, is_active, created_at
FROM public.logistics_providers
WHERE is_active = true;

GRANT SELECT ON public.logistics_providers_public TO authenticated;

-- 5. Prevent usage_events user_id spoofing
DROP POLICY IF EXISTS "Anyone can record events" ON public.usage_events;

CREATE POLICY "Anyone can record events"
ON public.usage_events
FOR INSERT
TO public
WITH CHECK (
  length(event_name) >= 1
  AND length(event_name) <= 100
  AND (user_id IS NULL OR user_id = auth.uid())
);