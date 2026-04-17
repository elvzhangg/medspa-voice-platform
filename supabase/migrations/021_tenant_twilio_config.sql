-- 021_tenant_twilio_config.sql
-- Per-tenant Twilio credentials (Path A: BYO Twilio).
-- Each tenant provisions their own Twilio account + number which becomes both
-- their AI receptionist inbound line AND the outbound SMS sender for staff
-- forward notifications. Falls back to platform-level TWILIO_* env vars if
-- a tenant hasn't connected yet.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS twilio_account_sid text,
  ADD COLUMN IF NOT EXISTS twilio_auth_token  text,
  ADD COLUMN IF NOT EXISTS twilio_phone_number text,
  ADD COLUMN IF NOT EXISTS twilio_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS twilio_last_test_at timestamptz,
  ADD COLUMN IF NOT EXISTS twilio_last_test_status text;

COMMENT ON COLUMN tenants.twilio_account_sid IS
  'Tenant-owned Twilio Account SID. When present, used for outbound SMS instead of platform defaults.';
COMMENT ON COLUMN tenants.twilio_auth_token IS
  'Tenant-owned Twilio Auth Token. Treat as secret — only accessible via service-role key.';
COMMENT ON COLUMN tenants.twilio_phone_number IS
  'E.164 Twilio number that serves as BOTH the AI inbound line and the outbound SMS sender.';
