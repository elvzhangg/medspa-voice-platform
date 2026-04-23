-- Migration: Per-visit revenue tracking
--
-- Until now, each client-sync round fetched visit-level data from the
-- booking platform (Boulevard today, more later), derived a single
-- lifetime_value_cents aggregate, and discarded the per-visit rows. This
-- migration gives those visits a home so the dashboard can show
-- "Revenue booked this week" and any future per-visit analytics without
-- re-fetching from the platform on every page load.
--
-- Not piggy-backing on calendar_events because:
--   - getClientHistory returns up to ~20 historical visits that would
--     pollute the forward-looking calendar view.
--   - calendar_events is the source of truth for availability; historical
--     closed visits muddy that contract.
--   - Separate table keeps lifetime_value_cents (migration 025) as a
--     derived cache — easy to rebuild from client_visits if it drifts.

CREATE TABLE IF NOT EXISTS client_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_profile_id UUID REFERENCES client_profiles(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,              -- 'boulevard' | 'mindbody' | ...
  external_id TEXT NOT NULL,           -- platform appointment id (the upsert key)
  service TEXT,
  provider TEXT,
  price_cents INTEGER,
  visit_at TIMESTAMPTZ NOT NULL,       -- when the service was rendered
  status TEXT,                         -- raw platform status string for debugging
  raw JSONB,                           -- full platform payload for future re-derivation
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_client_visits_tenant_time
  ON client_visits(tenant_id, visit_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_visits_profile
  ON client_visits(client_profile_id, visit_at DESC)
  WHERE client_profile_id IS NOT NULL;

ALTER TABLE client_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read client visits"
  ON client_visits FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  ));
