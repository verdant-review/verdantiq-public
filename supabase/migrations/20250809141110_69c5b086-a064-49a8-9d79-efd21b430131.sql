-- Helper functions for role checks using JWT claims and profiles fallback
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'role')::text;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    public.user_role() = 'Admin' OR
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_logistics_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    public.user_role() IN ('Logistics','Admin') OR
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true),
    false
  );
$$;

-- Create 3PL providers table
CREATE TABLE IF NOT EXISTS public.logistics_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_phone text,
  contact_email text,
  region text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.logistics_providers ENABLE ROW LEVEL SECURITY;

-- Policies for providers
DROP POLICY IF EXISTS "Logistics/Admin manage providers" ON public.logistics_providers;
DROP POLICY IF EXISTS "Authenticated can view providers" ON public.logistics_providers;

CREATE POLICY "Logistics/Admin manage providers"
ON public.logistics_providers
FOR ALL
TO authenticated
USING (public.is_logistics_or_admin())
WITH CHECK (public.is_logistics_or_admin());

CREATE POLICY "Authenticated can view providers"
ON public.logistics_providers
FOR SELECT
TO authenticated
USING (true);

-- Add provider assignment to collection_requests
ALTER TABLE public.collection_requests
ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.logistics_providers(id);

CREATE INDEX IF NOT EXISTS idx_collection_requests_provider_id
ON public.collection_requests(provider_id);

-- Status events table to track logistics stages and notes
CREATE TABLE IF NOT EXISTS public.collection_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_request_id uuid NOT NULL REFERENCES public.collection_requests(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_status_events ENABLE ROW LEVEL SECURITY;

-- Policies for status events
DROP POLICY IF EXISTS "Logistics/Admin manage status events" ON public.collection_status_events;
DROP POLICY IF EXISTS "Farmers read own status events" ON public.collection_status_events;

CREATE POLICY "Logistics/Admin manage status events"
ON public.collection_status_events
FOR ALL
TO authenticated
USING (public.is_logistics_or_admin())
WITH CHECK (public.is_logistics_or_admin());

CREATE POLICY "Farmers read own status events"
ON public.collection_status_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.collection_requests cr
    JOIN public.crop_cycles cc ON cc.id = cr.crop_cycle_id
    JOIN public.farms f ON f.id = cc.farm_id
    WHERE cr.id = collection_status_events.collection_request_id
      AND f.user_id = auth.uid()
  )
);

-- Replace fragile policies referencing auth.users with JWT-based helpers
-- collection_requests
DROP POLICY IF EXISTS "Logistics and Admins can update all collection requests" ON public.collection_requests;
DROP POLICY IF EXISTS "Logistics and Admins can view and update all collection request" ON public.collection_requests;

CREATE POLICY "Logistics/Admin can view collection requests"
ON public.collection_requests
FOR SELECT
TO authenticated
USING (public.is_logistics_or_admin());

CREATE POLICY "Logistics/Admin can update collection requests"
ON public.collection_requests
FOR UPDATE
TO authenticated
USING (public.is_logistics_or_admin());

-- goods_received_notes
DROP POLICY IF EXISTS "Logistics and Admins can create GRNs." ON public.goods_received_notes;
DROP POLICY IF EXISTS "Logistics and Admins can view GRNs." ON public.goods_received_notes;

CREATE POLICY "Logistics/Admin can insert GRNs"
ON public.goods_received_notes
FOR INSERT
TO authenticated
WITH CHECK (public.is_logistics_or_admin());

CREATE POLICY "Logistics/Admin can view GRNs"
ON public.goods_received_notes
FOR SELECT
TO authenticated
USING (public.is_logistics_or_admin());
