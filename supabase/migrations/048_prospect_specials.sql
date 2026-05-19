-- Migration: Prospect Specials
-- Adds a structured `specials` column to both prospect tables so the research
-- agent and the smart-import endpoint can capture limited-time offers,
-- promotions, and member perks the spa currently advertises.
--
-- Shape: [{name, description, discount, valid_through, eligibility, source_url}]
--   - name        — headline of the offer ("20% off first HydraFacial")
--   - discount    — headline value ("20% off", "$199 (reg $299)")
--   - valid_through — free-text expiration ("through May 31", "while supplies last")
--   - eligibility — restrictions ("new clients only", "members only")
--   - source_url  — required for traceability (never invent specials)
--
-- Without this column the smart-import's column-tolerant retry was silently
-- dropping the entire specials payload and reporting success.

ALTER TABLE outreach_prospects
  ADD COLUMN IF NOT EXISTS specials JSONB;

ALTER TABLE crm_prospects
  ADD COLUMN IF NOT EXISTS specials JSONB;

COMMENT ON COLUMN outreach_prospects.specials IS
  'Current limited-time offers / promotions / packages. Array of {name, description, discount, valid_through, eligibility, source_url}.';

COMMENT ON COLUMN crm_prospects.specials IS
  'Current limited-time offers / promotions / packages. Array of {name, description, discount, valid_through, eligibility, source_url}.';
