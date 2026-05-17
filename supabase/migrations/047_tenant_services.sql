-- Migration: tenant_services
-- Structured service + pricing catalog per tenant. Replaces ad-hoc entries
-- in the knowledge base for the things customers care about most — "what
-- services do you offer" and "how much is X". The KB stays as the long-tail
-- reference; this table is the curated, deterministic menu.
--
-- Pricing intentionally lives in a free-text column. Med-spa pricing is
-- messy: per-unit ("from $12/unit"), per-syringe, membership tiers, package
-- pricing. Trying to force a numeric column produces "$NaN" displays and
-- lost nuance. price_cents is optional for future sorting/filtering.

CREATE TABLE IF NOT EXISTS tenant_services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                      -- free-text so owners pick their own (Botox, Filler, Laser, Membership…)

  duration_min INTEGER,               -- typical appointment duration; helps booking math when present
  price_display TEXT,                 -- "$300", "from $12/unit", "starts at $650/syringe"
  price_cents INTEGER,                -- optional, for sortable / promotable numerics

  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,

  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'pdf')),
  source_filename TEXT,               -- when source='pdf', original filename for traceability

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_services_tenant      ON tenant_services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_services_active      ON tenant_services(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_tenant_services_category    ON tenant_services(tenant_id, category);

-- Tenant members can read/write their own services. Mirrors the RLS pattern
-- the rest of the dashboard tables already use (tenant_users join).
ALTER TABLE tenant_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_services_select ON tenant_services
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tenant_services_insert ON tenant_services
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tenant_services_update ON tenant_services
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tenant_services_delete ON tenant_services
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );
