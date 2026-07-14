-- Track NDVI-detected crop health anomalies
CREATE TABLE public.ndvi_anomalies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  farm_id UUID NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ndvi_current NUMERIC NOT NULL,
  ndvi_previous NUMERIC,
  drop_pct NUMERIC,
  severity TEXT NOT NULL DEFAULT 'warning', -- 'info' | 'warning' | 'critical'
  trigger_reason TEXT NOT NULL, -- 'wow_drop' | 'low_absolute' | 'sustained_decline'
  crop_context JSONB DEFAULT '{}'::jsonb, -- crop_type, growth_stage, weather snapshot
  diagnosis TEXT,
  recommended_actions JSONB DEFAULT '[]'::jsonb,
  language TEXT DEFAULT 'en',
  notified_dashboard BOOLEAN NOT NULL DEFAULT false,
  notified_whatsapp BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ndvi_anomalies_farm_detected ON public.ndvi_anomalies(farm_id, detected_at DESC);

ALTER TABLE public.ndvi_anomalies ENABLE ROW LEVEL SECURITY;

-- Farmers see anomalies for their own farms
CREATE POLICY "Farmers view own ndvi anomalies"
ON public.ndvi_anomalies
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = ndvi_anomalies.farm_id AND f.user_id = auth.uid()
));

-- Farmers can insert anomalies for their own farms (used by edge function via user JWT)
CREATE POLICY "Farmers insert own ndvi anomalies"
ON public.ndvi_anomalies
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = ndvi_anomalies.farm_id AND f.user_id = auth.uid()
));

-- Farmers can mark anomalies resolved
CREATE POLICY "Farmers update own ndvi anomalies"
ON public.ndvi_anomalies
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.farms f
  WHERE f.id = ndvi_anomalies.farm_id AND f.user_id = auth.uid()
));

-- Admins see all
CREATE POLICY "Admins view all ndvi anomalies"
ON public.ndvi_anomalies
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Helper: find most recent unresolved anomaly within cooldown window
CREATE OR REPLACE FUNCTION public.recent_ndvi_anomaly_exists(_farm_id UUID, _cooldown_days INT DEFAULT 7)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ndvi_anomalies
    WHERE farm_id = _farm_id
      AND detected_at >= (now() - (_cooldown_days || ' days')::interval)
      AND resolved_at IS NULL
  );
$$;