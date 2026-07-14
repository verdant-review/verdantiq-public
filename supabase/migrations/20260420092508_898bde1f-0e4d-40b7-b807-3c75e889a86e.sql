
-- ENUMS
DO $$ BEGIN CREATE TYPE public.farming_type AS ENUM ('crop','livestock','mixed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.equipment_category AS ENUM ('tractor','plough','planter','harvester','irrigation_pump','sprayer','thresher','mill','vehicle','hand_tool','other'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.power_source AS ENUM ('manual','animal','fuel','electric','solar'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.ownership_type AS ENUM ('owned','leased','shared','hired'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.equipment_condition AS ENUM ('new','good','fair','poor','broken'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- PROFILES
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS farming_type public.farming_type DEFAULT 'crop',
  ADD COLUMN IF NOT EXISTS livestock_of_interest text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'en';

-- FARMS
ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS farming_type public.farming_type DEFAULT 'crop';

-- EQUIPMENT
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS category public.equipment_category,
  ADD COLUMN IF NOT EXISTS power_source public.power_source DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS horsepower numeric,
  ADD COLUMN IF NOT EXISTS ownership public.ownership_type DEFAULT 'owned',
  ADD COLUMN IF NOT EXISTS condition public.equipment_condition DEFAULT 'good',
  ADD COLUMN IF NOT EXISTS is_operational boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS acquisition_cost_usd numeric;

-- SHARED updated_at function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- LIVESTOCK HERDS
CREATE TABLE IF NOT EXISTS public.livestock_herds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL,
  species text NOT NULL,
  breed text,
  herd_size integer NOT NULL DEFAULT 0,
  purpose text,
  housing_type text,
  start_date date DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.livestock_herds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Farmers manage own herds" ON public.livestock_herds;
CREATE POLICY "Farmers manage own herds" ON public.livestock_herds FOR ALL
  USING (EXISTS (SELECT 1 FROM public.farms f WHERE f.id = livestock_herds.farm_id AND f.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.farms f WHERE f.id = livestock_herds.farm_id AND f.user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins view all herds" ON public.livestock_herds;
CREATE POLICY "Admins view all herds" ON public.livestock_herds FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Logistics view all herds" ON public.livestock_herds;
CREATE POLICY "Logistics view all herds" ON public.livestock_herds FOR SELECT TO authenticated
  USING (public.is_logistics_or_admin(auth.uid()));

-- LIVESTOCK EVENTS
CREATE TABLE IF NOT EXISTS public.livestock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  herd_id uuid NOT NULL REFERENCES public.livestock_herds(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity numeric DEFAULT 0,
  value_usd numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.livestock_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Farmers manage own events" ON public.livestock_events;
CREATE POLICY "Farmers manage own events" ON public.livestock_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.livestock_herds h JOIN public.farms f ON f.id = h.farm_id WHERE h.id = livestock_events.herd_id AND f.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.livestock_herds h JOIN public.farms f ON f.id = h.farm_id WHERE h.id = livestock_events.herd_id AND f.user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins view all events" ON public.livestock_events;
CREATE POLICY "Admins view all events" ON public.livestock_events FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Logistics view all events" ON public.livestock_events;
CREATE POLICY "Logistics view all events" ON public.livestock_events FOR SELECT TO authenticated
  USING (public.is_logistics_or_admin(auth.uid()));

-- HP defaults
CREATE OR REPLACE FUNCTION public.infer_default_horsepower(_category public.equipment_category, _power public.power_source)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _power = 'manual' THEN 0
    WHEN _power = 'animal' THEN 1
    WHEN _category = 'tractor' THEN 60
    WHEN _category = 'harvester' THEN 100
    WHEN _category = 'irrigation_pump' THEN 5
    WHEN _category = 'sprayer' THEN 3
    WHEN _category = 'thresher' THEN 10
    WHEN _category = 'mill' THEN 15
    WHEN _category = 'vehicle' THEN 80
    WHEN _category = 'planter' THEN 4
    WHEN _category = 'plough' THEN 2
    ELSE 1
  END;
$$;

-- Mechanization score
CREATE OR REPLACE FUNCTION public.get_farm_mechanization_score(_farm_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_hp numeric := 0;
  hectares numeric := 1;
  raw_score numeric := 0;
  final_score int := 0;
  band text;
BEGIN
  SELECT COALESCE(NULLIF(size_hectares,0), 1) INTO hectares FROM public.farms WHERE id = _farm_id;
  SELECT COALESCE(SUM(
    CASE WHEN is_operational AND power_source IN ('fuel','electric','solar')
         THEN COALESCE(horsepower, public.infer_default_horsepower(category, power_source))
         WHEN is_operational AND power_source = 'animal' THEN 0.5
         ELSE 0 END
  ), 0) INTO total_hp FROM public.equipment WHERE farm_id = _farm_id;
  raw_score := (total_hp / hectares) * 4;
  final_score := LEAST(100, GREATEST(0, raw_score::int));
  band := CASE
    WHEN final_score < 25 THEN 'Mostly manual — typical for smallholders'
    WHEN final_score < 60 THEN 'Partially mechanized'
    ELSE 'Highly mechanized' END;
  RETURN jsonb_build_object('score', final_score, 'band', band, 'total_hp', total_hp, 'hectares', hectares);
END $$;

-- Vaccination notification
CREATE OR REPLACE FUNCTION public.notify_on_vaccination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  farm_owner uuid;
  herd_species text;
BEGIN
  IF NEW.event_type = 'vaccination' THEN
    SELECT f.user_id, h.species INTO farm_owner, herd_species
    FROM public.livestock_herds h JOIN public.farms f ON f.id = h.farm_id
    WHERE h.id = NEW.herd_id;
    IF farm_owner IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_user_id, title, message, type, metadata)
      VALUES (farm_owner, 'Vaccination logged',
        'Vaccination recorded for ' || COALESCE(herd_species,'herd') || ' on ' || NEW.event_date::text,
        'livestock', jsonb_build_object('herd_id', NEW.herd_id, 'event_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vaccination_notify ON public.livestock_events;
CREATE TRIGGER trg_vaccination_notify AFTER INSERT ON public.livestock_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_vaccination();

DROP TRIGGER IF EXISTS trg_herds_updated_at ON public.livestock_herds;
CREATE TRIGGER trg_herds_updated_at BEFORE UPDATE ON public.livestock_herds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
