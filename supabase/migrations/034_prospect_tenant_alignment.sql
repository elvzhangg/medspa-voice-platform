-- Migration: Align outreach_prospects with tenants field names + richer profile fields
-- Goal: when a prospect converts to a paying tenant, the data copy is a near-1:1
-- column-to-column transfer. Adds the missing fields that let the demo voice agent
-- answer policy/FAQ/parking/payment questions like a real tenant's agent would.

-- ─── Rename hours → business_hours (match tenants.business_hours) ──────────
ALTER TABLE outreach_prospects RENAME COLUMN hours TO business_hours;

-- ─── New fields that mirror tenant columns 1:1 ─────────────────────────────
ALTER TABLE outreach_prospects
  ADD COLUMN IF NOT EXISTS directions_parking_info TEXT,
  ADD COLUMN IF NOT EXISTS booking_config JSONB,
  ADD COLUMN IF NOT EXISTS system_prompt_override TEXT;

-- ─── Prospect-only: FAQs as structured data before they become KB chunks ───
-- Shape: [{ "question": "...", "answer": "..." }]
-- Seeded into knowledge_base_documents (category='faq') when demo is provisioned.
ALTER TABLE outreach_prospects
  ADD COLUMN IF NOT EXISTS faqs JSONB;
