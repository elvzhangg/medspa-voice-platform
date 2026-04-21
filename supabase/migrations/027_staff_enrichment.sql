-- Migration 027: staff enrichment for AI injection + platform sync
--
-- Motivation: today the voice AI has no knowledge of which providers work
-- at a clinic — the system prompt references "Dr. Sarah / Dr. Mia" purely
-- as illustrative examples. This migration turns `staff` into the
-- authoritative roster the AI reads at every call.
--
-- Three capabilities unlocked:
--   1. ai_notes + specialties — tenants enrich each provider with prose
--      and tags ("Sarah is our most experienced Botox injector; great
--      with first-timers") that get injected into the Vapi system prompt.
--   2. external_source + external_id — link each staff row back to its
--      counterpart in Boulevard/Acuity/Mindbody/etc. so a periodic sync
--      can upsert the platform roster without clobbering tenant edits.
--   3. active flag — hide former staff from the AI without deleting
--      history (and without losing the ai_notes they left behind).

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS ai_notes text,
  ADD COLUMN IF NOT EXISTS specialties text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

COMMENT ON COLUMN staff.ai_notes IS
  'Free-form notes the voice AI reads at call time. Tenant-authored. '
  'Example: "Sarah is our most experienced Botox injector and is great '
  'with first-timers." Never overwritten by platform sync.';

COMMENT ON COLUMN staff.specialties IS
  'Structured tags for matching callers to providers. '
  'Example: {"Botox","Juvederm","anxious clients"}. Tenant-authored.';

COMMENT ON COLUMN staff.external_source IS
  'Platform this staff row is synced from (boulevard/acuity/mindbody/etc.). '
  'NULL for internal-only tenants who manage their roster manually.';

COMMENT ON COLUMN staff.external_id IS
  'Platform-side staff identifier. Used with external_source as the upsert '
  'key during provider sync.';

COMMENT ON COLUMN staff.active IS
  'Soft-delete flag. Inactive rows are excluded from the AI system prompt '
  'but preserved so ai_notes/specialties survive a re-hire.';

-- Upsert key for platform sync. Partial index — internal rows (NULL
-- external_id) are free to duplicate, platform-synced rows are unique.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_external
  ON staff(tenant_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

-- Query pattern: "roster for tenant X, active only"
CREATE INDEX IF NOT EXISTS idx_staff_tenant_active
  ON staff(tenant_id) WHERE active = true;
