-- Migration: Week-Later Check-In add-on
--
-- Splits the one-week touchpoint out of clinical aftercare (which is now
-- limited to 2/24/48h) and into its own opt-in feature. The check-in
-- template is intentionally generic (no procedure name, no clinical
-- guidance) to keep PHI exposure to the minimum allowed under HIPAA's
-- "health care operations" carve-out.

-- ─── tenants: check-in toggle ─────────────────────────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS sms_checkin_enabled BOOLEAN NOT NULL DEFAULT false;

-- Narrow aftercare delay to clinical window. Any tenant currently on 168
-- (1 week) — legacy from migration 031 — collapses down to 48h. They can
-- re-enable the check-in separately.
UPDATE tenants SET sms_followup_hours = 48 WHERE sms_followup_hours = 168;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_sms_followup_hours_check;
ALTER TABLE tenants
  ADD CONSTRAINT tenants_sms_followup_hours_check
  CHECK (sms_followup_hours IN (2, 24, 48));

-- ─── sms_sent_log: allow 'checkin' as a distinct template_type ────────────
ALTER TABLE sms_sent_log DROP CONSTRAINT IF EXISTS sms_sent_log_template_type_check;
ALTER TABLE sms_sent_log
  ADD CONSTRAINT sms_sent_log_template_type_check
  CHECK (template_type IN ('confirmation', 'reminder', 'followup', 'checkin'));
