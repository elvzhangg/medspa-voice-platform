-- Add email draft fields to outreach_prospects for AI agent approval workflow
ALTER TABLE outreach_prospects
  ADD COLUMN IF NOT EXISTS email_draft_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_draft_body TEXT,
  ADD COLUMN IF NOT EXISTS email_approved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_notes TEXT;
