-- Replace the partial unique index on calendar_events with a full unique
-- constraint, so Postgres can infer it for ON CONFLICT in upserts.
--
-- Migration 026 originally created:
--   CREATE UNIQUE INDEX uq_calendar_events_external
--     ON calendar_events(tenant_id, external_source, external_id)
--     WHERE external_id IS NOT NULL;
--
-- The WHERE clause makes it a *partial* unique index. Postgres's ON CONFLICT
-- inference doesn't reliably match partial indexes when the inserted row's
-- values would or wouldn't fall into the WHERE — Supabase's upsert via
--   .upsert({...}, { onConflict: "tenant_id,external_source,external_id" })
-- silently fails with "no unique or exclusion constraint matching..." for
-- google_calendar appointment sync. Result: listAppointments fetched 6 events,
-- upsertPlatformAppointment returned true (its error path just logs and returns
-- true regardless), but no rows landed in calendar_events.
--
-- Switching to a full UNIQUE constraint:
--   - Postgres unique constraints treat NULLs as DISTINCT by default, so
--     bookInternal-created rows (external_id IS NULL) can still coexist
--     without colliding — same effective behavior as the partial index.
--   - ON CONFLICT inference now works deterministically.

DROP INDEX IF EXISTS uq_calendar_events_external;

ALTER TABLE calendar_events
  ADD CONSTRAINT uq_calendar_events_external
    UNIQUE (tenant_id, external_source, external_id);
