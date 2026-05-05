-- Migration: CRM (replaces the outreach prospects flow)
-- Self-contained table for the new admin CRM. Not linked to outreach_prospects
-- or outreach_campaigns by design — CRM is the new system, outreach stays
-- intact during the transition.

CREATE TABLE IF NOT EXISTS crm_prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  business_name TEXT NOT NULL,
  website TEXT,
  -- Generated normalized form so dedup works across "https://www.foo.com/" vs "foo.com".
  website_normalized TEXT
    GENERATED ALWAYS AS (
      NULLIF(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(website, '')), '^https?://', ''),
            '^www\.', ''
          ),
          '/$', ''
        ),
        ''
      )
    ) STORED,

  email TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  address TEXT,
  booking_platform TEXT,

  -- Decision-maker contacts (when found by the research agent).
  owner_name TEXT,
  owner_email TEXT,
  owner_title TEXT,

  -- Structured profile mirrors outreach_prospects' richer fields. JSONB so the
  -- shape can evolve without column-add migrations.
  locations         JSONB,
  procedures        JSONB,
  providers         JSONB,
  business_hours    JSONB,
  faqs              JSONB,
  services_summary  TEXT,
  pricing_notes     TEXT,

  -- Verification trail from the research agent.
  research_sources    JSONB,
  verification_notes  JSONB,
  research_confidence NUMERIC,
  agent_notes         TEXT,
  researched_at       TIMESTAMPTZ,

  -- CRM workflow.
  crm_stage TEXT NOT NULL DEFAULT 'top_of_funnel'
    CHECK (crm_stage IN ('top_of_funnel', 'crm', 'rejected')),
  crm_promoted_at TIMESTAMPTZ,
  crm_promoted_by TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_prospects_stage    ON crm_prospects(crm_stage);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_state    ON crm_prospects(state);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_platform ON crm_prospects(booking_platform);

-- Unique only on rows with a website — businesses without a known site
-- shouldn't collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_crm_prospects_website
  ON crm_prospects(website_normalized)
  WHERE website_normalized IS NOT NULL;

-- Admin-only via service role; no RLS needed (only supabaseAdmin touches this).
