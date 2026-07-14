-- Make agribusiness-specific fields nullable so NGOs can submit a different question set
ALTER TABLE public.discovery_responses
  ALTER COLUMN relationship_type DROP NOT NULL,
  ALTER COLUMN farmer_count_band DROP NOT NULL,
  ALTER COLUMN current_monitoring DROP NOT NULL,
  ALTER COLUMN would_pay DROP NOT NULL,
  ALTER COLUMN one_fix DROP NOT NULL;

-- Add audience segmentation + NGO-specific columns
ALTER TABLE public.discovery_responses
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'agribusiness',
  ADD COLUMN IF NOT EXISTS ngo_program_type text,
  ADD COLUMN IF NOT EXISTS ngo_funder_type text,
  ADD COLUMN IF NOT EXISTS ngo_beneficiary_band text,
  ADD COLUMN IF NOT EXISTS ngo_me_tools text,
  ADD COLUMN IF NOT EXISTS ngo_pain_ranking jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ngo_reporting_burden text,
  ADD COLUMN IF NOT EXISTS ngo_budget_band text,
  ADD COLUMN IF NOT EXISTS ngo_must_have text;

ALTER TABLE public.discovery_responses
  ADD CONSTRAINT discovery_audience_check
  CHECK (audience IN ('agribusiness', 'ngo'));

CREATE INDEX IF NOT EXISTS idx_discovery_audience ON public.discovery_responses(audience);