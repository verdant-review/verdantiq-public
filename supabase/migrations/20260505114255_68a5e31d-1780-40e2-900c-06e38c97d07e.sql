CREATE TABLE public.discovery_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  farmer_count_band TEXT NOT NULL,
  current_monitoring TEXT NOT NULL,
  pain_ranking JSONB NOT NULL DEFAULT '[]'::jsonb,
  would_pay TEXT NOT NULL,
  would_pay_notes TEXT,
  one_fix TEXT NOT NULL,
  follow_up_ok BOOLEAN NOT NULL DEFAULT false,
  follow_up_contact TEXT,
  source TEXT,
  user_agent TEXT,
  CONSTRAINT discovery_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT discovery_company_len CHECK (char_length(company) BETWEEN 1 AND 160),
  CONSTRAINT discovery_role_len CHECK (char_length(role) BETWEEN 1 AND 120),
  CONSTRAINT discovery_email_len CHECK (char_length(email) BETWEEN 3 AND 255),
  CONSTRAINT discovery_relationship_len CHECK (char_length(relationship_type) BETWEEN 1 AND 60),
  CONSTRAINT discovery_band_len CHECK (char_length(farmer_count_band) BETWEEN 1 AND 30),
  CONSTRAINT discovery_monitoring_len CHECK (char_length(current_monitoring) BETWEEN 1 AND 60),
  CONSTRAINT discovery_would_pay_vals CHECK (would_pay IN ('yes','depends','no')),
  CONSTRAINT discovery_would_pay_notes_len CHECK (would_pay_notes IS NULL OR char_length(would_pay_notes) <= 500),
  CONSTRAINT discovery_one_fix_len CHECK (char_length(one_fix) BETWEEN 1 AND 500),
  CONSTRAINT discovery_followup_contact_len CHECK (follow_up_contact IS NULL OR char_length(follow_up_contact) <= 160),
  CONSTRAINT discovery_source_len CHECK (source IS NULL OR char_length(source) <= 80),
  CONSTRAINT discovery_ua_len CHECK (user_agent IS NULL OR char_length(user_agent) <= 500)
);

ALTER TABLE public.discovery_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit discovery responses"
  ON public.discovery_responses
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Admins can view discovery responses"
  ON public.discovery_responses
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE INDEX idx_discovery_responses_created_at ON public.discovery_responses(created_at DESC);