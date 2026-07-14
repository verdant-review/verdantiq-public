-- Fix the profile creation trigger to properly handle user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    full_name, 
    value_chain_stage, 
    region
  )
  VALUES (
    new.id, 
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'value_chain_stage',
    new.raw_user_meta_data ->> 'region'
  );
  RETURN new;
END;
$$;

-- Update the existing farmer user's profile with correct data
UPDATE public.profiles 
SET 
  value_chain_stage = 'farmer',
  region = 'Karoi'
WHERE email = 'farmer@verdant.co.zw';