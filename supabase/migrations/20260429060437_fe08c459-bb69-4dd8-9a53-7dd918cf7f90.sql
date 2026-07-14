
-- =========================
-- 1. platform_feedback
-- =========================
CREATE TABLE public.platform_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL,
  feedback_type TEXT NOT NULL DEFAULT 'other',
  rating INTEGER NULL,
  message TEXT NOT NULL,
  page_route TEXT NULL,
  user_agent TEXT NULL,
  viewport TEXT NULL,
  app_version TEXT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  admin_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_feedback_type_chk CHECK (feedback_type IN ('bug','idea','praise','other')),
  CONSTRAINT platform_feedback_status_chk CHECK (status IN ('new','triaged','resolved','wontfix')),
  CONSTRAINT platform_feedback_rating_chk CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5))
);

CREATE INDEX idx_platform_feedback_created ON public.platform_feedback(created_at DESC);
CREATE INDEX idx_platform_feedback_user ON public.platform_feedback(user_id);
CREATE INDEX idx_platform_feedback_status ON public.platform_feedback(status);

ALTER TABLE public.platform_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit feedback"
  ON public.platform_feedback FOR INSERT
  WITH CHECK (length(message) BETWEEN 1 AND 2000);

CREATE POLICY "Users can view their own feedback"
  ON public.platform_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all feedback"
  ON public.platform_feedback FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update feedback"
  ON public.platform_feedback FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- length cap trigger (defensive)
CREATE OR REPLACE FUNCTION public.cap_feedback_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF length(NEW.message) > 2000 THEN
    NEW.message := substring(NEW.message from 1 for 2000);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cap_feedback_message
  BEFORE INSERT OR UPDATE ON public.platform_feedback
  FOR EACH ROW EXECUTE FUNCTION public.cap_feedback_message();

-- =========================
-- 2. usage_events
-- =========================
CREATE TABLE public.usage_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL,
  event_name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  page_route TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_created ON public.usage_events(created_at DESC);
CREATE INDEX idx_usage_events_name ON public.usage_events(event_name);
CREATE INDEX idx_usage_events_user ON public.usage_events(user_id);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record events"
  ON public.usage_events FOR INSERT
  WITH CHECK (length(event_name) BETWEEN 1 AND 100);

CREATE POLICY "Admins can view all events"
  ON public.usage_events FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- =========================
-- 3. service_components
-- =========================
CREATE TABLE public.service_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  check_url TEXT NULL,
  latency_warning_ms INTEGER NOT NULL DEFAULT 2000,
  latency_critical_ms INTEGER NOT NULL DEFAULT 5000,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.service_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view public components"
  ON public.service_components FOR SELECT
  USING (is_public = true);

CREATE POLICY "Admins can view all components"
  ON public.service_components FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage components"
  ON public.service_components FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- =========================
-- 4. service_health_checks
-- =========================
CREATE TABLE public.service_health_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_id UUID NOT NULL REFERENCES public.service_components(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  latency_ms INTEGER NULL,
  error_message TEXT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT health_status_chk CHECK (status IN ('up','degraded','down','unknown'))
);

CREATE INDEX idx_health_checks_component_time ON public.service_health_checks(component_id, checked_at DESC);
CREATE INDEX idx_health_checks_time ON public.service_health_checks(checked_at DESC);

ALTER TABLE public.service_health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view health checks of public components"
  ON public.service_health_checks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.service_components c
    WHERE c.id = service_health_checks.component_id AND c.is_public = true
  ));

CREATE POLICY "Admins can view all health checks"
  ON public.service_health_checks FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert health checks"
  ON public.service_health_checks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- =========================
-- 5. incidents
-- =========================
CREATE TABLE public.incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_id UUID NULL REFERENCES public.service_components(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  severity TEXT NOT NULL DEFAULT 'minor',
  status TEXT NOT NULL DEFAULT 'investigating',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT incidents_severity_chk CHECK (severity IN ('minor','major','critical','maintenance')),
  CONSTRAINT incidents_status_chk CHECK (status IN ('investigating','identified','monitoring','resolved'))
);

CREATE INDEX idx_incidents_started ON public.incidents(started_at DESC);

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view incidents"
  ON public.incidents FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage incidents"
  ON public.incidents FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- updated_at triggers (reuse existing helper if present, else inline)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_components_updated BEFORE UPDATE ON public.service_components
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_incidents_updated BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================
-- 6. Seed monitored components
-- =========================
INSERT INTO public.service_components (name, slug, description, display_order, check_url) VALUES
  ('Web Application', 'web-app', 'VerdantOS dashboard and public site', 1, NULL),
  ('Database', 'database', 'Primary PostgreSQL database', 2, NULL),
  ('AI Agronomist', 'ai-agronomist', 'AI-powered farming advisor', 3, 'ai-agronomist'),
  ('Weather Service', 'weather', 'OpenMeteo weather data integration', 4, 'weather-data'),
  ('Yield Prediction', 'yield-prediction', 'Crop yield forecasting service', 5, 'yield-prediction'),
  ('Market Data', 'market-scraper', 'Mbare and ZimPriceCheck market prices', 6, 'market-scraper'),
  ('WhatsApp Bot', 'whatsapp', 'WhatsApp messaging integration', 7, 'whatsapp-webhook'),
  ('Satellite NDVI', 'satellite-ndvi', 'Crop health satellite monitoring', 8, 'satellite-ndvi');
