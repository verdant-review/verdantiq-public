
-- Remove the GMB scraper cron job
SELECT cron.unschedule('market-price-collection');

-- Remove fake GMB-generated rows from current prices (history kept for audit trail)
DELETE FROM public.market_prices WHERE source = 'gmbdura_scraper';

-- Schedule the real ZimPriceCheck scraper to run daily at 06:00 UTC (08:00 CAT)
SELECT cron.schedule(
  'zimpricecheck-daily-scrape',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://keagskdlvfjyegxqzrdv.supabase.co/functions/v1/zimpricecheck-scraper',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlYWdza2RsdmZqeWVneHF6cmR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMTUzMDUsImV4cCI6MjA2NTU5MTMwNX0.wPJXYLb71shJAZJd8neDfORpRRDczrb1f3KkOjFkz-U"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
