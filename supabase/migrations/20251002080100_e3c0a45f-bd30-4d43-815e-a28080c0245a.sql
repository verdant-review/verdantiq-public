-- Create market price history table for daily tracking
CREATE TABLE IF NOT EXISTS public.market_price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crop TEXT NOT NULL,
  price NUMERIC NOT NULL,
  price_change NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  unit TEXT NOT NULL DEFAULT 'MT',
  region TEXT NOT NULL,
  market_location TEXT,
  source TEXT DEFAULT 'manual',
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.market_price_history ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Anyone can view historical prices"
  ON public.market_price_history
  FOR SELECT
  USING (true);

-- Create policy for admin insert
CREATE POLICY "Admins can insert historical prices"
  ON public.market_price_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Create index for efficient querying
CREATE INDEX idx_market_price_history_date ON public.market_price_history(recorded_date DESC);
CREATE INDEX idx_market_price_history_crop_date ON public.market_price_history(crop, recorded_date DESC);
CREATE INDEX idx_market_price_history_region_date ON public.market_price_history(region, recorded_date DESC);

-- Create a similar history table for Mbare prices
CREATE TABLE IF NOT EXISTS public.mbare_price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item TEXT NOT NULL,
  quantity TEXT NOT NULL,
  usd_price NUMERIC NOT NULL,
  zig_price NUMERIC NOT NULL,
  source TEXT,
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mbare_price_history ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Anyone can view mbare historical prices"
  ON public.mbare_price_history
  FOR SELECT
  USING (true);

-- Create index for efficient querying
CREATE INDEX idx_mbare_price_history_date ON public.mbare_price_history(recorded_date DESC);
CREATE INDEX idx_mbare_price_history_item_date ON public.mbare_price_history(item, recorded_date DESC);