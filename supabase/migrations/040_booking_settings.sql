-- Tenant-level scheduling settings, used by integrations that compute
-- availability themselves (currently the Google Calendar adapter — Boulevard,
-- Acuity, Mindbody, etc. defer to the platform's own scheduler).
--
-- Shape:
--   service_durations  Record<string, number>  -- service name -> minutes
--                                                 keys are case-insensitive,
--                                                 "default" is the catch-all
--   buffer_min         number                  -- cleanup minutes between
--                                                 appointments (symmetric)
--
-- Tenant-editable via /dashboard/scheduling. The Google Calendar adapter
-- reads this through ctx.tenantData (populated by loadTenantIntegration)
-- so the adapter never directly queries the DB.
--
-- staff.working_hours (already exists from migration 012) remains the source
-- of truth for working-hours-by-day-of-week — both the AI's system prompt
-- (assistant-builder.ts) and the GCal adapter read from it.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS booking_settings JSONB
  DEFAULT '{"service_durations":{"default":60},"buffer_min":0}'::jsonb;

-- Backfill existing tenants whose row was created before this column existed.
-- The default above only applies to NEW inserts; ALTER ADD doesn't retroactively
-- populate. We set the same default explicitly for any rows whose value is null.
UPDATE tenants
   SET booking_settings = '{"service_durations":{"default":60},"buffer_min":0}'::jsonb
 WHERE booking_settings IS NULL;
