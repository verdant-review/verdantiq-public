INSERT INTO service_health_checks (component_id, status, latency_ms, error_message, checked_at)
VALUES ('d85e9648-8519-4dcf-90b0-b4c72f680157', 'down', NULL, 'Twilio outbound delivery failures (error 63012). Inbound webhook is healthy; outbound WhatsApp messages are not being delivered by Twilio/Meta.', now());

INSERT INTO incidents (component_id, title, description, severity, status, started_at)
VALUES (
  'd85e9648-8519-4dcf-90b0-b4c72f680157',
  'WhatsApp Bot outbound delivery failure',
  'Twilio is returning error 63012 (internal service error) on outbound WhatsApp messages. The webhook receives inbound messages and generates replies successfully, but Twilio/Meta is not delivering them to recipients. Investigation with Twilio support is in progress.',
  'major',
  'investigating',
  now()
);