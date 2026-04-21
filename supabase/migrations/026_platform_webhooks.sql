-- Platform webhook listener (Phase 3 of the integration story)
--
-- Lets a booking platform push appointment changes to us so our
-- calendar_events stay in sync with bookings made outside VauxVoice
-- (front-desk walk-ins, staff drag-and-drop in Boulevard's UI, etc.).
--
-- Three pieces:
--   1. calendar_events gets an external_id + source so we can upsert
--      by (tenant, source, external_id) and dedupe webhook retries.
--   2. tenant_integrations gets a webhook_secret used to verify HMAC
--      signatures on inbound requests.
--   3. platform_webhook_events is a raw-event audit log — cheap to
--      scan when a customer calls saying "I see a cancellation in
--      Boulevard but the dashboard still shows it".

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_events_external
  ON calendar_events(tenant_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE tenant_integrations
  ADD COLUMN IF NOT EXISTS webhook_secret text,
  ADD COLUMN IF NOT EXISTS webhook_last_received_at timestamptz;

CREATE TABLE IF NOT EXISTS platform_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  platform text NOT NULL,
  event_type text,                -- adapter-normalized: appointment.created|updated|cancelled
  external_id text,               -- platform appointment id
  signature_ok boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  processing_error text,
  raw_headers jsonb,
  raw_body jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_webhook_events_tenant
  ON platform_webhook_events(tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_webhook_events_external
  ON platform_webhook_events(platform, external_id);
