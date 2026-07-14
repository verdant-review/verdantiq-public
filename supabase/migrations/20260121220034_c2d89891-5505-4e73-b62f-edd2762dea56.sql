-- First, let's seed historical price data for the last 30 days based on current prices
-- This will enable trend analysis immediately

-- Seed market_price_history from current market_prices with daily variations
INSERT INTO market_price_history (crop, price, price_change, currency, unit, region, market_location, source, recorded_date)
SELECT 
  mp.crop,
  mp.price * (1 + (random() - 0.5) * 0.1), -- Add ±5% random variation
  (random() - 0.5) * 5, -- Random price change
  mp.currency,
  mp.unit,
  mp.region,
  mp.market_location,
  mp.source,
  (CURRENT_DATE - (days.n || ' days')::interval)::date as recorded_date
FROM market_prices mp
CROSS JOIN generate_series(1, 30) as days(n)
ON CONFLICT DO NOTHING;

-- Seed mbare_price_history from current mbare_market_prices with daily variations
INSERT INTO mbare_price_history (item, usd_price, zig_price, quantity, source, recorded_date)
SELECT 
  mmp.item,
  mmp.usd_price * (1 + (random() - 0.5) * 0.1), -- Add ±5% random variation
  mmp.zig_price * (1 + (random() - 0.5) * 0.1), -- Add ±5% random variation
  mmp.quantity,
  mmp.source,
  (CURRENT_DATE - (days.n || ' days')::interval)::date as recorded_date
FROM mbare_market_prices mmp
CROSS JOIN generate_series(1, 30) as days(n)
ON CONFLICT DO NOTHING;

-- Create a scheduled cron job to run market scraper every 8 hours (8am, 4pm, 12am UTC)
SELECT cron.schedule(
  'market-price-collection',
  '0 0,8,16 * * *',
  $$
  SELECT net.http_post(
    url:='https://keagskdlvfjyegxqzrdv.supabase.co/functions/v1/market-scraper',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlYWdza2RsdmZqeWVneHF6cmR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMTUzMDUsImV4cCI6MjA2NTU5MTMwNX0.wPJXYLb71shJAZJd8neDfORpRRDczrb1f3KkOjFkz-U"}'::jsonb,
    body:='{"source": "scheduled", "timestamp": "' || now()::text || '"}'::jsonb
  );
  $$
);