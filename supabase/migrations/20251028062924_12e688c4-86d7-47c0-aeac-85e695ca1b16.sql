-- Phase 1: Security & Core Infrastructure Migration

-- =============================================
-- PART 1: SECURITY - Enable RLS on all tables
-- =============================================

-- Enable RLS on profiles (already has policies, but ensure it's enabled)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop the public read policy that exposes emails
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;

-- Keep only user-specific and admin access
-- (The other policies already exist and are good)

-- Enable RLS on ai_interactions (already has policies)
ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;

-- Enable RLS on knowledge_interactions
ALTER TABLE public.knowledge_interactions ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for knowledge_interactions
CREATE POLICY "Users can view their own knowledge interactions"
  ON public.knowledge_interactions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own knowledge interactions"
  ON public.knowledge_interactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Enable RLS on conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for conversations
CREATE POLICY "Users can view their own conversations"
  ON public.conversations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Enable RLS on mbare_market_prices (keep public read but add audit)
ALTER TABLE public.mbare_market_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view mbare market prices"
  ON public.mbare_market_prices
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert mbare prices"
  ON public.mbare_market_prices
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- Enable RLS on market_price_history (already has view policy)
ALTER TABLE public.market_price_history ENABLE ROW LEVEL SECURITY;

-- Enable RLS on mbare_price_history (already has view policy)  
ALTER TABLE public.mbare_price_history ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PART 2: MESSAGING PREFERENCES TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.messaging_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT,
  whatsapp_enabled BOOLEAN DEFAULT false,
  sms_enabled BOOLEAN DEFAULT false,
  preferred_channel TEXT DEFAULT 'web' CHECK (preferred_channel IN ('web', 'sms', 'whatsapp')),
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'sn', 'nd')),
  price_alerts_enabled BOOLEAN DEFAULT true,
  weather_alerts_enabled BOOLEAN DEFAULT true,
  task_reminders_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on messaging_preferences
ALTER TABLE public.messaging_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own messaging preferences"
  ON public.messaging_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messaging preferences"
  ON public.messaging_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messaging preferences"
  ON public.messaging_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_messaging_preferences_user_id ON public.messaging_preferences(user_id);

-- =============================================
-- PART 3: MESSAGE LOG TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'sms', 'whatsapp')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_content TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'pending')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on message_log
ALTER TABLE public.message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own message log"
  ON public.message_log
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert message logs"
  ON public.message_log
  FOR INSERT
  WITH CHECK (true);

-- Admins can view all message logs for debugging
CREATE POLICY "Admins can view all message logs"
  ON public.message_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- Create indexes for faster queries
CREATE INDEX idx_message_log_user_id ON public.message_log(user_id);
CREATE INDEX idx_message_log_created_at ON public.message_log(created_at DESC);
CREATE INDEX idx_message_log_channel ON public.message_log(channel);