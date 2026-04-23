-- Migration: Prospect Profiles
-- Adds structured data to outreach_prospects for rich per-prospect profiles
-- and preps the tenants table for prospect/production separation + multi-location + vapi account sharding.

-- ─── outreach_prospects: structured profile fields ─────────────────────────
ALTER TABLE outreach_prospects
  ADD COLUMN IF NOT EXISTS owner_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_email TEXT,
  ADD COLUMN IF NOT EXISTS owner_title TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS locations JSONB,          -- [{label, address, phone, hours}]
  ADD COLUMN IF NOT EXISTS procedures JSONB,         -- [{name, description, duration_min, price, notes}]
  ADD COLUMN IF NOT EXISTS pricing JSONB,            -- {category: [{item, price, notes}]} or flat array
  ADD COLUMN IF NOT EXISTS providers JSONB,          -- [{name, title, specialties, bio}]
  ADD COLUMN IF NOT EXISTS hours JSONB,              -- {monday: {open, close}, ...}
  ADD COLUMN IF NOT EXISTS social_links JSONB,       -- {instagram, facebook, tiktok, yelp, google}
  ADD COLUMN IF NOT EXISTS research_sources JSONB,   -- [{url, fetched_at, fields_extracted}]
  ADD COLUMN IF NOT EXISTS research_confidence NUMERIC(3,2), -- 0.00–1.00 overall confidence
  ADD COLUMN IF NOT EXISTS researched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS demo_provisioned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_call_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS demo_last_called_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_reply_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_outreach_prospects_demo_tenant ON outreach_prospects(demo_tenant_id);

-- ─── outreach_prospect_events: timeline/event feed ─────────────────────────
CREATE TABLE IF NOT EXISTS outreach_prospect_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES outreach_prospects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- 'researched' | 'demo_provisioned' | 'email_drafted' | 'email_sent' | 'email_opened' | 'email_replied' | 'demo_called' | 'status_changed' | 'note_added'
  summary TEXT,              -- short human-readable line
  payload JSONB,             -- structured details (call_id, email_id, old_status, new_status, etc.)
  actor TEXT,                -- 'agent:research' | 'agent:email' | 'user:<email>' | 'system'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_events_prospect ON outreach_prospect_events(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_events_type ON outreach_prospect_events(event_type);

-- ─── tenants: prospect/production separation + multi-location + sharding ───
-- Doors open for future: separate Vapi sub-org per account, multi-location med spas,
-- and clean prospect→trial→active promotion without rebuilding.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('prospect', 'trial', 'active', 'paused', 'churned')),
  ADD COLUMN IF NOT EXISTS vapi_account_id TEXT,                 -- e.g. 'production-1', 'prospects-1' — nullable until multi-account lands
  ADD COLUMN IF NOT EXISTS parent_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_label TEXT;                  -- e.g. "Downtown", "Brentwood"

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_parent ON tenants(parent_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_vapi_account ON tenants(vapi_account_id);
