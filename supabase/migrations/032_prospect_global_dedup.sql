-- Migration: Globally unique prospects with many-to-many campaigns
-- A prospect (= one real business) can now belong to multiple campaigns without duplication.
-- Also adds a normalized website column with a unique index so the research agent can't
-- insert the same spa twice across runs.

-- ─── Normalized website for dedup ──────────────────────────────────────────
-- Strips protocol, www., trailing slash. Stored as a generated column so it's
-- always in sync with website. NULL websites are allowed (some spas don't have one).
ALTER TABLE outreach_prospects
  ADD COLUMN IF NOT EXISTS website_normalized TEXT
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
    ) STORED;

-- Unique index only applies where website_normalized is not null,
-- so prospects without a website don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_prospect_website
  ON outreach_prospects(website_normalized)
  WHERE website_normalized IS NOT NULL;

-- ─── Many-to-many campaign membership ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS prospect_campaign_memberships (
  prospect_id UUID NOT NULL REFERENCES outreach_prospects(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (prospect_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_campaign ON prospect_campaign_memberships(campaign_id);
CREATE INDEX IF NOT EXISTS idx_memberships_prospect ON prospect_campaign_memberships(prospect_id);

-- Backfill: every existing prospect becomes a member of its original campaign.
INSERT INTO prospect_campaign_memberships (prospect_id, campaign_id, added_at)
SELECT id, campaign_id, coalesce(created_at, NOW())
FROM outreach_prospects
WHERE campaign_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Keep outreach_prospects.campaign_id as a nullable "origin campaign" pointer
-- for backward compatibility. New code reads from the join table.
-- (We do NOT drop it — existing queries/code still reference it until they're migrated.)
ALTER TABLE outreach_prospects ALTER COLUMN campaign_id DROP NOT NULL;
