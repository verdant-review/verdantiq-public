
-- 1. PROFILES: prevent self-escalation to admin
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND is_admin = (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid())
);

-- 2. Drop and recreate role-check helpers cleanly.
--    Cascade is required because RLS policies reference these functions.
DROP FUNCTION IF EXISTS public.is_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_logistics_or_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_logistics_or_admin() CASCADE;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_admin = true);
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

CREATE OR REPLACE FUNCTION public.is_logistics_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text IN ('admin','logistics'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_admin = true);
$$;

CREATE OR REPLACE FUNCTION public.is_logistics_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_logistics_or_admin(auth.uid());
$$;

-- Lock down EXECUTE on these helpers
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_logistics_or_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_logistics_or_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_logistics_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_logistics_or_admin(uuid) TO authenticated;

-- Re-create the policies that depended on these functions (CASCADE dropped them).

-- profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- user_roles
CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- farms
CREATE POLICY "Admins can view all farms"
ON public.farms FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Logistics and admins can view all farms"
ON public.farms FOR SELECT TO authenticated
USING (public.is_logistics_or_admin(auth.uid()));

-- crop_cycles
CREATE POLICY "Admins can view all crop cycles"
ON public.crop_cycles FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

-- satellite_imagery
CREATE POLICY "Admins can view all satellite imagery"
ON public.satellite_imagery FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

-- livestock_herds
CREATE POLICY "Admins view all herds"
ON public.livestock_herds FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Logistics view all herds"
ON public.livestock_herds FOR SELECT TO authenticated
USING (public.is_logistics_or_admin(auth.uid()));

-- livestock_events
CREATE POLICY "Admins view all events"
ON public.livestock_events FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Logistics view all events"
ON public.livestock_events FOR SELECT TO authenticated
USING (public.is_logistics_or_admin(auth.uid()));

-- collection_requests
CREATE POLICY "Logistics/Admin can view collection requests"
ON public.collection_requests FOR SELECT TO authenticated
USING (public.is_logistics_or_admin());

CREATE POLICY "Logistics/Admin can update collection requests"
ON public.collection_requests FOR UPDATE TO authenticated
USING (public.is_logistics_or_admin());

-- collection_status_events
CREATE POLICY "Logistics/Admin manage status events"
ON public.collection_status_events FOR ALL TO authenticated
USING (public.is_logistics_or_admin())
WITH CHECK (public.is_logistics_or_admin());

-- goods_received_notes
CREATE POLICY "Logistics/Admin can view GRNs"
ON public.goods_received_notes FOR SELECT TO authenticated
USING (public.is_logistics_or_admin());

CREATE POLICY "Logistics/Admin can insert GRNs"
ON public.goods_received_notes FOR INSERT TO authenticated
WITH CHECK (public.is_logistics_or_admin());

-- logistics_providers
CREATE POLICY "Logistics/Admin manage providers"
ON public.logistics_providers FOR ALL TO authenticated
USING (public.is_logistics_or_admin())
WITH CHECK (public.is_logistics_or_admin());

-- 3. WHATSAPP_SESSIONS: remove blanket policy, scope reads to owner.
DROP POLICY IF EXISTS "System can manage whatsapp sessions" ON public.whatsapp_sessions;

CREATE POLICY "Users can view their own whatsapp session"
ON public.whatsapp_sessions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 4. MESSAGE_LOG: tighten INSERT
DROP POLICY IF EXISTS "System can insert message logs" ON public.message_log;

CREATE POLICY "Users can insert their own message logs"
ON public.message_log
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 5. MESSAGING_PREFERENCES: scope all to authenticated
DROP POLICY IF EXISTS "Users can insert their own messaging preferences" ON public.messaging_preferences;
DROP POLICY IF EXISTS "Users can update their own messaging preferences" ON public.messaging_preferences;
DROP POLICY IF EXISTS "Users can view their own messaging preferences" ON public.messaging_preferences;

CREATE POLICY "Users can view their own messaging preferences"
ON public.messaging_preferences FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messaging preferences"
ON public.messaging_preferences FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messaging preferences"
ON public.messaging_preferences FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
