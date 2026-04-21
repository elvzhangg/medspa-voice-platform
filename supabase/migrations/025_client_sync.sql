-- Client Intelligence Phase 2 — sync from booking platform
--
-- Adds the columns needed to remember platform-sourced history on
-- client_profiles, so a returning caller can be greeted with their
-- real last-visit + lifetime-value context pulled from Boulevard
-- (and, later, the other direct-book platforms).

ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_source text,                   -- 'boulevard' | 'acuity' | ...
  ADD COLUMN IF NOT EXISTS sync_error text,
  ADD COLUMN IF NOT EXISTS lifetime_value_cents bigint,
  ADD COLUMN IF NOT EXISTS platform_visit_count int,
  ADD COLUMN IF NOT EXISTS platform_last_visit_at timestamptz,
  ADD COLUMN IF NOT EXISTS favorite_service text,
  ADD COLUMN IF NOT EXISTS favorite_staff text;

-- Fast lookup for the "needs a resync" query in client-sync.ts
CREATE INDEX IF NOT EXISTS idx_client_profiles_sync_age
  ON client_profiles(tenant_id, last_synced_at NULLS FIRST);
