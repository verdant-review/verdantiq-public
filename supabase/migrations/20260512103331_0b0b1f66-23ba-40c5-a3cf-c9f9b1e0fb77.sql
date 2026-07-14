-- Resolve the WhatsApp Bot incident
UPDATE incidents
SET
  status = 'resolved',
  resolved_at = now(),
  updated_at = now()
WHERE component_id = 'd85e9648-8519-4dcf-90b0-b4c72f680157'
  AND status != 'resolved';

-- Record an 'up' health check for the WhatsApp Bot component
INSERT INTO service_health_checks (component_id, status, latency_ms, error_message, checked_at)
VALUES ('d85e9648-8519-4dcf-90b0-b4c72f680157', 'up', 0, NULL, now());