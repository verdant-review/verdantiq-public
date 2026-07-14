-- Update grain prices to GMB 2025/26 Approved Incentive Producer Prices (Media Release 14/04/2026)
UPDATE public.market_prices SET price = 364.75, source = 'GMB Official', region = 'Zimbabwe', last_updated = now()
WHERE crop = 'Maize';

UPDATE public.market_prices SET price = 583.01, source = 'GMB Official', region = 'Zimbabwe', last_updated = now()
WHERE crop = 'Soybeans';

UPDATE public.market_prices SET price = 670.46, source = 'GMB Official', region = 'Zimbabwe', last_updated = now()
WHERE crop = 'Sunflower';

-- Insert Traditional Grain (new commodity from GMB release)
INSERT INTO public.market_prices (crop, price, currency, unit, source, region, last_updated, price_change)
SELECT 'Traditional Grain', 364.75, 'USD', 'MT', 'GMB Official', 'Zimbabwe', now(), 0
WHERE NOT EXISTS (SELECT 1 FROM public.market_prices WHERE crop = 'Traditional Grain');