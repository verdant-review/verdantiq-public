
-- Enums
CREATE TYPE public.scheme_status AS ENUM ('draft', 'recruiting', 'active', 'closed', 'archived');
CREATE TYPE public.enrollment_status AS ENUM ('invited', 'active', 'withdrawn', 'completed');
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE public.scheme_report_type AS ENUM ('compliance', 'impact', 'season_summary', 'custom');

-- SCHEMES
CREATE TABLE public.schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  commodity_id UUID REFERENCES public.commodities(id),
  region_id UUID REFERENCES public.regions(id),
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  status public.scheme_status NOT NULL DEFAULT 'draft',
  description TEXT,
  start_date DATE,
  end_date DATE,
  target_farmer_count INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_schemes_org ON public.schemes(organization_id);
CREATE INDEX idx_schemes_status ON public.schemes(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schemes TO authenticated;
GRANT ALL ON public.schemes TO service_role;
ALTER TABLE public.schemes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view schemes" ON public.schemes FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), organization_id) OR public.is_admin(auth.uid()));

CREATE POLICY "Org managers manage schemes" ON public.schemes FOR ALL TO authenticated
USING (public.has_org_role(auth.uid(), organization_id, ARRAY['org_owner'::org_role, 'org_manager'::org_role, 'org_agronomist'::org_role]) OR public.is_admin(auth.uid()))
WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['org_owner'::org_role, 'org_manager'::org_role, 'org_agronomist'::org_role]) OR public.is_admin(auth.uid()));

CREATE TRIGGER trg_schemes_updated_at BEFORE UPDATE ON public.schemes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SCHEME ENROLLMENTS
CREATE TABLE public.scheme_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id UUID NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  farmer_user_id UUID NOT NULL,
  field_id UUID REFERENCES public.fields(id) ON DELETE SET NULL,
  status public.enrollment_status NOT NULL DEFAULT 'invited',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scheme_id, farmer_user_id, field_id)
);
CREATE INDEX idx_enrollments_scheme ON public.scheme_enrollments(scheme_id);
CREATE INDEX idx_enrollments_farmer ON public.scheme_enrollments(farmer_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheme_enrollments TO authenticated;
GRANT ALL ON public.scheme_enrollments TO service_role;
ALTER TABLE public.scheme_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farmers view own enrollments" ON public.scheme_enrollments FOR SELECT TO authenticated
USING (farmer_user_id = auth.uid());

CREATE POLICY "Farmers update own enrollments" ON public.scheme_enrollments FOR UPDATE TO authenticated
USING (farmer_user_id = auth.uid());

CREATE POLICY "Org staff view enrollments" ON public.scheme_enrollments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.schemes s
  WHERE s.id = scheme_id
    AND (public.is_org_member(auth.uid(), s.organization_id) OR public.is_admin(auth.uid()))
));

CREATE POLICY "Org managers manage enrollments" ON public.scheme_enrollments FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.schemes s
  WHERE s.id = scheme_id
    AND (public.has_org_role(auth.uid(), s.organization_id, ARRAY['org_owner'::org_role, 'org_manager'::org_role, 'org_agronomist'::org_role, 'org_extension'::org_role]) OR public.is_admin(auth.uid()))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.schemes s
  WHERE s.id = scheme_id
    AND (public.has_org_role(auth.uid(), s.organization_id, ARRAY['org_owner'::org_role, 'org_manager'::org_role, 'org_agronomist'::org_role, 'org_extension'::org_role]) OR public.is_admin(auth.uid()))
));

CREATE TRIGGER trg_enrollments_updated_at BEFORE UPDATE ON public.scheme_enrollments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SCHEME INVITATIONS
CREATE TABLE public.scheme_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id UUID NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  phone_number TEXT,
  email TEXT,
  farmer_name TEXT,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status public.invitation_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  accepted_by_user_id UUID,
  accepted_at TIMESTAMPTZ,
  invited_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (phone_number IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX idx_invitations_scheme ON public.scheme_invitations(scheme_id);
CREATE INDEX idx_invitations_token ON public.scheme_invitations(token);
CREATE INDEX idx_invitations_status ON public.scheme_invitations(status);

GRANT SELECT ON public.scheme_invitations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheme_invitations TO authenticated;
GRANT ALL ON public.scheme_invitations TO service_role;
ALTER TABLE public.scheme_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public view invitation by token" ON public.scheme_invitations FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Org managers manage invitations" ON public.scheme_invitations FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.schemes s
  WHERE s.id = scheme_id
    AND (public.has_org_role(auth.uid(), s.organization_id, ARRAY['org_owner'::org_role, 'org_manager'::org_role, 'org_agronomist'::org_role, 'org_extension'::org_role]) OR public.is_admin(auth.uid()))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.schemes s
  WHERE s.id = scheme_id
    AND (public.has_org_role(auth.uid(), s.organization_id, ARRAY['org_owner'::org_role, 'org_manager'::org_role, 'org_agronomist'::org_role, 'org_extension'::org_role]) OR public.is_admin(auth.uid()))
));

-- SCHEME REPORTS (Phase 3)
CREATE TABLE public.scheme_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id UUID NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  report_type public.scheme_report_type NOT NULL DEFAULT 'season_summary',
  title TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_url TEXT,
  csv_url TEXT,
  generated_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_scheme ON public.scheme_reports(scheme_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheme_reports TO authenticated;
GRANT ALL ON public.scheme_reports TO service_role;
ALTER TABLE public.scheme_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view scheme reports" ON public.scheme_reports FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.schemes s
  WHERE s.id = scheme_id
    AND (public.is_org_member(auth.uid(), s.organization_id) OR public.is_admin(auth.uid()))
));

CREATE POLICY "Org managers generate reports" ON public.scheme_reports FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.schemes s
  WHERE s.id = scheme_id
    AND (public.has_org_role(auth.uid(), s.organization_id, ARRAY['org_owner'::org_role, 'org_manager'::org_role, 'org_agronomist'::org_role]) OR public.is_admin(auth.uid()))
));

CREATE POLICY "Org managers delete reports" ON public.scheme_reports FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.schemes s
  WHERE s.id = scheme_id
    AND (public.has_org_role(auth.uid(), s.organization_id, ARRAY['org_owner'::org_role, 'org_manager'::org_role]) OR public.is_admin(auth.uid()))
));

-- Helper: check if user can manage scheme (used by edge functions via security definer)
CREATE OR REPLACE FUNCTION public.can_manage_scheme(_user_id UUID, _scheme_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schemes s
    WHERE s.id = _scheme_id
      AND (public.has_org_role(_user_id, s.organization_id, ARRAY['org_owner'::org_role, 'org_manager'::org_role, 'org_agronomist'::org_role, 'org_extension'::org_role]) OR public.is_admin(_user_id))
  );
$$;
