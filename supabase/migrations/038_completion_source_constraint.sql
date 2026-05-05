-- Migration 038: relax completion_source CHECK on calendar_events
--
-- Migration 031 added completion_source with a fixed allow-list:
--   ('manual', 'webhook_boulevard', 'webhook_mindbody', 'webhook_square', 'system')
--
-- The new manual-sync backfill path (appointment-sync.ts → upsertPlatformAppointment)
-- writes 'backfill_<platform>' to distinguish webhook-driven completions
-- from full-reconciliation completions in audit logs. That value isn't
-- in the original list, so completion writes from the backfill silently
-- fail with a CHECK constraint violation.
--
-- We have multiple platforms in flight (Mindbody, Boulevard, Acuity, etc.)
-- and two ingestion paths each — maintaining the allow-list as the
-- platform list grows is more friction than value. Drop the CHECK; the
-- application is the source of truth for which sources it writes.

ALTER TABLE calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_completion_source_check;
