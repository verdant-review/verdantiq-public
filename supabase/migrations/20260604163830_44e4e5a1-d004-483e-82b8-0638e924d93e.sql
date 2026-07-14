
-- Ensure shared updated_at helper exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.org_type AS ENUM ('exporter','ngo','processor','government','cooperative');
CREATE TYPE public.org_plan AS ENUM ('pilot','growth','enterprise');
CREATE TYPE public.org_status AS ENUM ('prospect','pilot','active','suspended','archived');
CREATE TYPE public.org_role AS ENUM ('org_owner','org_manager','org_agronomist','org_extension','org_viewer');

-- ============================================================
-- REGIONS
-- ============================================================
CREATE TABLE public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  country_code text NOT NULL,
  parent_region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.regions TO anon, authenticated;
GRANT ALL ON public.regions TO service_role;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Regions are publicly readable" ON public.regions FOR SELECT USING (true);
CREATE POLICY "Admins manage regions" ON public.regions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- COMMODITIES
-- ============================================================
CREATE TABLE public.commodities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL DEFAULT 'tonnes',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.commodities TO anon, authenticated;
GRANT ALL ON public.commodities TO service_role;
ALTER TABLE public.commodities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Commodities are publicly readable" ON public.commodities FOR SELECT USING (true);
CREATE POLICY "Admins manage commodities" ON public.commodities FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  type public.org_type NOT NULL,
  plan public.org_plan NOT NULL DEFAULT 'pilot',
  status public.org_status NOT NULL DEFAULT 'prospect',
  region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL,
  pilot_expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizations_slug ON public.organizations(slug);
CREATE INDEX idx_organizations_status ON public.organizations(status);
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ORG MEMBERS
-- ============================================================
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'org_viewer',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_org_members_user ON public.org_members(user_id);
CREATE INDEX idx_org_members_org ON public.org_members(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members TO authenticated;
GRANT ALL ON public.org_members TO service_role;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECURITY DEFINER HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_orgs(_user_id uuid)
RETURNS TABLE(organization_id uuid, role public.org_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT organization_id, role FROM public.org_members WHERE user_id = _user_id $$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _roles public.org_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.org_members WHERE user_id = _user_id AND organization_id = _org_id AND role = ANY(_roles)) $$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.org_members WHERE user_id = _user_id AND organization_id = _org_id) $$;

-- Org policies
CREATE POLICY "Members can view their organizations" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), id) OR public.is_admin(auth.uid()));
CREATE POLICY "Public can view live org headers" ON public.organizations FOR SELECT TO anon
  USING (status IN ('pilot','active'));
CREATE POLICY "Owners and admins update orgs" ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), id, ARRAY['org_owner','org_manager']::public.org_role[]) OR public.is_admin(auth.uid()))
  WITH CHECK (public.has_org_role(auth.uid(), id, ARRAY['org_owner','org_manager']::public.org_role[]) OR public.is_admin(auth.uid()));
CREATE POLICY "Admins create orgs" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Members view org_members of their orgs" ON public.org_members FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id) OR public.is_admin(auth.uid()));
CREATE POLICY "Owners/managers manage members" ON public.org_members FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['org_owner','org_manager']::public.org_role[]) OR public.is_admin(auth.uid()))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['org_owner','org_manager']::public.org_role[]) OR public.is_admin(auth.uid()));

-- ============================================================
-- ORG BRANDING
-- ============================================================
CREATE TABLE public.org_branding (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  logo_url text,
  primary_color text,
  accent_color text,
  contact_email text,
  contact_phone text,
  tagline text,
  website_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.org_branding TO anon, authenticated;
GRANT INSERT, UPDATE ON public.org_branding TO authenticated;
GRANT ALL ON public.org_branding TO service_role;
ALTER TABLE public.org_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Branding is publicly readable" ON public.org_branding FOR SELECT USING (true);
CREATE POLICY "Owners manage branding" ON public.org_branding FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['org_owner','org_manager']::public.org_role[]) OR public.is_admin(auth.uid()))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['org_owner','org_manager']::public.org_role[]) OR public.is_admin(auth.uid()));

-- ============================================================
-- FIELDS
-- ============================================================
CREATE TABLE public.fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default Field',
  area_hectares numeric,
  boundary geometry(Polygon, 4326),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fields_farm ON public.fields(farm_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fields TO authenticated;
GRANT ALL ON public.fields TO service_role;
ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;

-- Phase-1 stub; Phase 2 will extend to check scheme membership
CREATE OR REPLACE FUNCTION public.org_field_visible(_user_id uuid, _field_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT false $$;

CREATE POLICY "Farmers manage own fields" ON public.fields FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.farms f WHERE f.id = fields.farm_id AND f.user_id = auth.uid()))
  WITH CHECK (EXISTS(SELECT 1 FROM public.farms f WHERE f.id = fields.farm_id AND f.user_id = auth.uid()));
CREATE POLICY "Admins view all fields" ON public.fields FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Org members view linked fields" ON public.fields FOR SELECT TO authenticated
  USING (public.org_field_visible(auth.uid(), id));

CREATE OR REPLACE FUNCTION public.create_default_field()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.fields (farm_id, name, area_hectares, is_default)
  VALUES (NEW.id, 'Main Field', NEW.size_hectares, true);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_farm_default_field AFTER INSERT ON public.farms
  FOR EACH ROW EXECUTE FUNCTION public.create_default_field();

INSERT INTO public.fields (farm_id, name, area_hectares, is_default)
SELECT id, 'Main Field', size_hectares, true FROM public.farms
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE fields.farm_id = farms.id);

-- ============================================================
-- DATA LICENSE ACCEPTANCE
-- ============================================================
CREATE TABLE public.data_license_acceptance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  accepted_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  license_version text NOT NULL,
  license_text_hash text,
  ip_address text,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dla_org ON public.data_license_acceptance(organization_id);
GRANT SELECT, INSERT ON public.data_license_acceptance TO authenticated;
GRANT ALL ON public.data_license_acceptance TO service_role;
ALTER TABLE public.data_license_acceptance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view license acceptance" ON public.data_license_acceptance FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id) OR public.is_admin(auth.uid()));
CREATE POLICY "Owners record license acceptance" ON public.data_license_acceptance FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['org_owner']::public.org_role[]) OR public.is_admin(auth.uid()));

-- ============================================================
-- DATA ACCESS LOG
-- ============================================================
CREATE TABLE public.data_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dal_org ON public.data_access_log(organization_id);
CREATE INDEX idx_dal_actor ON public.data_access_log(actor_user_id);
CREATE INDEX idx_dal_action ON public.data_access_log(action);
GRANT SELECT, INSERT ON public.data_access_log TO authenticated;
GRANT ALL ON public.data_access_log TO service_role;
ALTER TABLE public.data_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org owners view audit log" ON public.data_access_log FOR SELECT TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['org_owner','org_manager']::public.org_role[]) OR public.is_admin(auth.uid()));
CREATE POLICY "Authenticated insert audit log" ON public.data_access_log FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- ANALYTICS SCHEMA
-- ============================================================
CREATE SCHEMA IF NOT EXISTS analytics;
GRANT USAGE ON SCHEMA analytics TO authenticated, service_role;

CREATE TABLE analytics.field_ndvi_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL,
  observed_on date NOT NULL,
  ndvi numeric,
  cloud_cover_pct numeric,
  source text DEFAULT 'sentinel-2',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_id, observed_on)
);
CREATE INDEX idx_andvi_field_date ON analytics.field_ndvi_daily(field_id, observed_on DESC);
GRANT ALL ON analytics.field_ndvi_daily TO service_role;
ALTER TABLE analytics.field_ndvi_daily ENABLE ROW LEVEL SECURITY;

CREATE TABLE analytics.region_yield_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid REFERENCES public.regions(id) ON DELETE CASCADE,
  commodity_id uuid REFERENCES public.commodities(id) ON DELETE CASCADE,
  season text NOT NULL,
  yield_hg_per_ha numeric,
  sample_size integer,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON analytics.region_yield_benchmarks TO service_role;
ALTER TABLE analytics.region_yield_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE TABLE analytics.climate_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid REFERENCES public.regions(id) ON DELETE CASCADE,
  computed_for date NOT NULL,
  drought_risk numeric,
  flood_risk numeric,
  frost_risk numeric,
  heat_stress_risk numeric,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON analytics.climate_risk_scores TO service_role;
ALTER TABLE analytics.climate_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE TABLE analytics.production_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid REFERENCES public.regions(id) ON DELETE CASCADE,
  commodity_id uuid REFERENCES public.commodities(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  signal_value numeric,
  observed_on date NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON analytics.production_signals TO service_role;
ALTER TABLE analytics.production_signals ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE TRIGGER trg_orgs_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_branding_updated_at BEFORE UPDATE ON public.org_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fields_updated_at BEFORE UPDATE ON public.fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO public.regions (code, name, country_code) VALUES
  ('ZW','Zimbabwe','ZW'),
  ('ZM','Zambia','ZM'),
  ('MW','Malawi','MW'),
  ('MZ','Mozambique','MZ'),
  ('ZA','South Africa','ZA');

INSERT INTO public.commodities (slug, name, category, unit) VALUES
  ('maize','Maize','grain','tonnes'),
  ('sorghum','Sorghum','grain','tonnes'),
  ('soyabean','Soyabean','legume','tonnes'),
  ('groundnut','Groundnut','legume','tonnes'),
  ('sunflower','Sunflower','oilseed','tonnes'),
  ('cotton','Cotton','cash-crop','tonnes'),
  ('tobacco','Tobacco','cash-crop','tonnes'),
  ('macadamia','Macadamia','tree-nut','tonnes'),
  ('beef-cattle','Beef Cattle','livestock','head'),
  ('dairy-cattle','Dairy Cattle','livestock','head');

INSERT INTO public.organizations (slug, name, type, plan, status, region_id)
SELECT 'kuminda','Kuminda','exporter','growth','prospect', id FROM public.regions WHERE code='ZW';

INSERT INTO public.organizations (slug, name, type, plan, status, region_id)
SELECT 'orap','Organization of Rural Associations for Progress (ORAP)','ngo','growth','prospect', id FROM public.regions WHERE code='ZW';

INSERT INTO public.org_branding (organization_id, primary_color, accent_color, tagline)
SELECT id, '#1B5E20', '#FBC02D', 'Premium macadamia exports from Zimbabwe' FROM public.organizations WHERE slug='kuminda';

INSERT INTO public.org_branding (organization_id, primary_color, accent_color, tagline)
SELECT id, '#0D47A1', '#FF6F00', 'Empowering rural communities since 1981' FROM public.organizations WHERE slug='orap';
