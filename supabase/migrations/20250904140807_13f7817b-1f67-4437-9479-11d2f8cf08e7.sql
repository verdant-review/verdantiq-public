-- Create notifications table for admin to farmer communication
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL,
  sender_user_id UUID,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own notifications" 
ON public.notifications 
FOR SELECT 
USING (auth.uid() = recipient_user_id);

CREATE POLICY "Admins can create notifications" 
ON public.notifications 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

CREATE POLICY "Users can update their own notifications" 
ON public.notifications 
FOR UPDATE 
USING (auth.uid() = recipient_user_id);

-- Create equipment tracking table
CREATE TABLE public.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  model TEXT,
  purchase_date DATE,
  status TEXT DEFAULT 'active',
  maintenance_schedule JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for equipment
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

-- Create policy for equipment
CREATE POLICY "Farmers can manage equipment for their farms" 
ON public.equipment 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM farms f 
    WHERE f.id = equipment.farm_id 
    AND f.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM farms f 
    WHERE f.id = equipment.farm_id 
    AND f.user_id = auth.uid()
  )
);

-- Create farm reports table
CREATE TABLE public.farm_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  period_start DATE,
  period_end DATE,
  created_by UUID
);

-- Enable RLS for farm reports
ALTER TABLE public.farm_reports ENABLE ROW LEVEL SECURITY;

-- Create policy for reports
CREATE POLICY "Farmers can view reports for their farms" 
ON public.farm_reports 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM farms f 
    WHERE f.id = farm_reports.farm_id 
    AND f.user_id = auth.uid()
  )
);

-- Create indexes for performance
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_equipment_farm_id ON public.equipment(farm_id);
CREATE INDEX idx_farm_reports_farm_id ON public.farm_reports(farm_id);