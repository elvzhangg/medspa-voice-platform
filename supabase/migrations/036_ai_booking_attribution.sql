-- Migration: AI booking attribution
--
-- Adds a flag on calendar_events so we can distinguish AI-booked
-- appointments from walk-ins / platform-native bookings once they
-- arrive via webhook. Without this flag the revenue card on the
-- Overview dashboard double-counts: every completed visit from the
-- connected platform looks identical whether Vivienne booked it or
-- a front-desk staff member did.
--
-- The flag is set to true at the moment of booking (in bookViaAdapter)
-- and preserved by the webhook upsert via ON CONFLICT DO UPDATE that
-- never flips it back to false.

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS booked_via_ai BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_calendar_events_booked_via_ai
  ON calendar_events(tenant_id, booked_via_ai)
  WHERE booked_via_ai = true;
