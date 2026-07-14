-- Enable PostGIS extension for geography types
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create farms table
CREATE TABLE IF NOT EXISTS public.farms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  boundary GEOGRAPHY(POLYGON, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create crop_cycles table
CREATE TABLE IF NOT EXISTS public.crop_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  area_hectares NUMERIC(10, 2) NOT NULL,
  planting_date DATE,
  estimated_harvest_date DATE,
  status TEXT NOT NULL DEFAULT 'Planning',
  predicted_yield_tonnes NUMERIC(10, 2),
  actual_yield_tonnes NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cycle_tasks table
CREATE TABLE IF NOT EXISTS public.cycle_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_cycle_id UUID NOT NULL REFERENCES public.crop_cycles(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  due_date DATE NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create collection_requests table
CREATE TABLE IF NOT EXISTS public.collection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_cycle_id UUID NOT NULL REFERENCES public.crop_cycles(id) ON DELETE CASCADE,
  request_date DATE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'Pending',
  scheduled_pickup_date DATE,
  assigned_vehicle_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create goods_received_notes table
CREATE TABLE IF NOT EXISTS public.goods_received_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_request_id UUID NOT NULL REFERENCES public.collection_requests(id) ON DELETE CASCADE,
  quantity_bags INT,
  weight_tonnes NUMERIC(10, 2) NOT NULL,
  quality_grade TEXT,
  received_by_driver_signature TEXT,
  farmer_confirmation_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycle_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_received_notes ENABLE ROW LEVEL SECURITY;

-- Policies for farms
DROP POLICY IF EXISTS "Farmers can see and manage their own farms." ON public.farms;
CREATE POLICY "Farmers can see and manage their own farms." ON public.farms
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policies for crop_cycles (tie back to farm owner)
DROP POLICY IF EXISTS "Farmers can manage crop cycles on their own farms." ON public.crop_cycles;
CREATE POLICY "Farmers can manage crop cycles on their own farms." ON public.crop_cycles
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.farms f WHERE f.id = crop_cycles.farm_id AND f.user_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.farms f WHERE f.id = crop_cycles.farm_id AND f.user_id = auth.uid()
  )
);

-- Policies for cycle_tasks (tie through crop_cycle -> farm -> user)
DROP POLICY IF EXISTS "Farmers can manage tasks on their crop cycles." ON public.cycle_tasks;
CREATE POLICY "Farmers can manage tasks on their crop cycles." ON public.cycle_tasks
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.crop_cycles cc
    JOIN public.farms f ON f.id = cc.farm_id
    WHERE cc.id = cycle_tasks.crop_cycle_id AND f.user_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.crop_cycles cc
    JOIN public.farms f ON f.id = cc.farm_id
    WHERE cc.id = cycle_tasks.crop_cycle_id AND f.user_id = auth.uid()
  )
);

-- Policies for collection_requests
DROP POLICY IF EXISTS "Farmers can manage their own collection requests." ON public.collection_requests;
CREATE POLICY "Farmers can manage their own collection requests." ON public.collection_requests
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.crop_cycles cc
    JOIN public.farms f ON f.id = cc.farm_id
    WHERE cc.id = collection_requests.crop_cycle_id AND f.user_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.crop_cycles cc
    JOIN public.farms f ON f.id = cc.farm_id
    WHERE cc.id = collection_requests.crop_cycle_id AND f.user_id = auth.uid()
  )
);

-- Logistics/Admin broad access for collection_requests
DROP POLICY IF EXISTS "Logistics and Admins can view and update all collection requests." ON public.collection_requests;
CREATE POLICY "Logistics and Admins can view and update all collection requests." ON public.collection_requests
FOR SELECT USING ( (
  SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()
) IN ('Logistics', 'Admin') );

CREATE POLICY "Logistics and Admins can update all collection requests" ON public.collection_requests
FOR UPDATE USING ( (
  SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()
) IN ('Logistics', 'Admin') );

-- Policies for goods_received_notes
DROP POLICY IF EXISTS "Farmers can view GRNs for their farms." ON public.goods_received_notes;
CREATE POLICY "Farmers can view GRNs for their farms." ON public.goods_received_notes
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.collection_requests cr
    JOIN public.crop_cycles cc ON cc.id = cr.crop_cycle_id
    JOIN public.farms f ON f.id = cc.farm_id
    WHERE cr.id = goods_received_notes.collection_request_id AND f.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Logistics and Admins can create GRNs." ON public.goods_received_notes;
CREATE POLICY "Logistics and Admins can create GRNs." ON public.goods_received_notes
FOR INSERT WITH CHECK ( (
  SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()
) IN ('Logistics', 'Admin') );

DROP POLICY IF EXISTS "Logistics and Admins can view GRNs." ON public.goods_received_notes;
CREATE POLICY "Logistics and Admins can view GRNs." ON public.goods_received_notes
FOR SELECT USING ( (
  SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()
) IN ('Logistics', 'Admin') );
