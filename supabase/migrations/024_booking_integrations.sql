-- Booking platform integrations
--
-- Three-tier model based on each platform's API capability:
--   direct_book   Boulevard, Acuity, Mindbody, Square, Zenoti — AI reads
--                 availability and writes the booking itself.
--   hybrid        Vagaro (read-only tiers), etc. — AI confirms availability
--                 via API but hands the actual write to staff via SMS.
--   sms_fallback  Fresha, GlossGenius, Jane, self-managed calendars — AI
--                 collects details, forwards request to staff SMS.
--
-- Tenant dashboard shows only the fields relevant to their mode. All API
-- credentials live in tenant_integrations and are written only by admins.

-- Tenant-level summary (visible to the tenant's dashboard, editable by admin)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS integration_platform text,
  ADD COLUMN IF NOT EXISTS integration_mode text
    CHECK (integration_mode IN ('direct_book', 'hybrid', 'sms_fallback')),
  ADD COLUMN IF NOT EXISTS integration_status text
    CHECK (integration_status IN ('pending', 'connected', 'error', 'disabled'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS integration_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS integration_last_error text;

-- Per-tenant credentials + platform-specific config. Service role only.
CREATE TABLE IF NOT EXISTS tenant_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform text NOT NULL,           -- boulevard | acuity | mindbody | ...
  mode text NOT NULL
    CHECK (mode IN ('direct_book', 'hybrid', 'sms_fallback')),

  -- OAuth / API key storage. Treat as secret — never expose to tenant.
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  oauth_access_token text,
  oauth_refresh_token text,
  oauth_expires_at timestamptz,

  -- Platform-specific settings the admin configures (location ID,
  -- business ID, service/provider ID maps, webhook secrets, etc.)
  config jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Health
  last_synced_at timestamptz,
  last_test_at timestamptz,
  last_test_status text,            -- 'ok' | 'error'
  last_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant
  ON tenant_integrations(tenant_id);
