SELECT cron.schedule(
  'daily-whatsapp-digest',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url:='https://keagskdlvfjyegxqzrdv.supabase.co/functions/v1/daily-whatsapp-digest',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlYWdza2RsdmZqeWVneHF6cmR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMTUzMDUsImV4cCI6MjA2NTU5MTMwNX0.wPJXYLb71shJAZJd8neDfORpRRDczrb1f3KkOjFkz-U"}'::jsonb,
    body:='{"time": "morning_digest"}'::jsonb
  ) AS request_id;
  $$
);