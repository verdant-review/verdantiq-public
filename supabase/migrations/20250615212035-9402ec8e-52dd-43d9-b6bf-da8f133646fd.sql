
-- Create table to store AI agronomist interactions for training data
CREATE TABLE public.ai_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  session_id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  context_data JSONB, -- Store additional context like location, crops mentioned, etc.
  feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
  feedback_comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying by user and session
CREATE INDEX idx_ai_interactions_user_session ON public.ai_interactions(user_id, session_id);
CREATE INDEX idx_ai_interactions_created_at ON public.ai_interactions(created_at);

-- Enable RLS
ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;

-- Policies for ai_interactions
CREATE POLICY "Users can view their own interactions" 
  ON public.ai_interactions FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own interactions" 
  ON public.ai_interactions FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own interactions" 
  ON public.ai_interactions FOR UPDATE 
  USING (auth.uid() = user_id);

-- Admin policy to view all interactions for training purposes
CREATE POLICY "Admins can view all interactions" 
  ON public.ai_interactions FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );
