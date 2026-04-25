-- Migration: Verification notes on prospects
-- Stores cross-source verification results from the research agent's
-- post-extraction verification pass (Google/Yelp/phone cross-check).

ALTER TABLE outreach_prospects
  ADD COLUMN IF NOT EXISTS verification_notes JSONB;
