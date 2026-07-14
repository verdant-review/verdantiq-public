
-- Create user profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  value_chain_stage TEXT CHECK (value_chain_stage IN ('farmer', 'trader', 'processor', 'retailer', 'consumer', 'input_supplier', 'financier', 'government', 'researcher')),
  region TEXT,
  crops_of_interest TEXT[],
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view their own profile" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" 
  ON public.profiles FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Create market prices table for admin management
CREATE TABLE public.market_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crop TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  unit TEXT NOT NULL DEFAULT 'MT',
  region TEXT NOT NULL,
  market_location TEXT,
  price_change DECIMAL(5,2),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source TEXT DEFAULT 'manual',
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on market prices
ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;

-- Create policies for market prices
CREATE POLICY "Anyone can view market prices" 
  ON public.market_prices FOR SELECT 
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert market prices" 
  ON public.market_prices FOR INSERT 
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can update market prices" 
  ON public.market_prices FOR UPDATE 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Create soil test data table
CREATE TABLE public.soil_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users,
  field_name TEXT,
  location TEXT,
  test_date DATE,
  ph_level DECIMAL(3,2),
  nitrogen DECIMAL(5,2),
  phosphorus DECIMAL(5,2),
  potassium DECIMAL(5,2),
  organic_matter DECIMAL(5,2),
  file_url TEXT,
  recommendations TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on soil tests
ALTER TABLE public.soil_tests ENABLE ROW LEVEL SECURITY;

-- Create policies for soil tests
CREATE POLICY "Users can view their own soil tests" 
  ON public.soil_tests FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own soil tests" 
  ON public.soil_tests FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own soil tests" 
  ON public.soil_tests FOR UPDATE 
  USING (auth.uid() = user_id);

-- Create weather data cache table
CREATE TABLE public.weather_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region TEXT NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  temperature DECIMAL(5,2),
  humidity INTEGER,
  rainfall DECIMAL(5,2),
  wind_speed DECIMAL(5,2),
  soil_temperature_0cm DECIMAL(5,2),
  soil_temperature_6cm DECIMAL(5,2),
  soil_temperature_18cm DECIMAL(5,2),
  soil_moisture_0_1cm DECIMAL(5,2),
  soil_moisture_1_3cm DECIMAL(5,2),
  condition TEXT,
  forecast_data JSONB,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 hour'
);

-- Enable RLS on weather cache
ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

-- Create policy for weather cache
CREATE POLICY "Anyone can view weather cache" 
  ON public.weather_cache FOR SELECT 
  TO authenticated
  USING (true);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.email)
  );
  RETURN new;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create storage bucket for soil test files
INSERT INTO storage.buckets (id, name, public)
VALUES ('soil-tests', 'soil-tests', true);

-- Create storage policy for soil test files
CREATE POLICY "Users can upload their own soil test files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'soil-tests' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own soil test files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'soil-tests' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
