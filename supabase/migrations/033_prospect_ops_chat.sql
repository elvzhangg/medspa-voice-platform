-- Migration: Prospect Ops Chat
-- Internal operator-side chat with an AI agent that can edit prospect data,
-- regenerate emails, release demo numbers, and add custom knowledge chunks.
-- Completely separate from the customer-side chat-engine.ts flow.

CREATE TABLE IF NOT EXISTS prospect_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES outreach_prospects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT,                    -- text content for user/assistant messages
  tool_calls JSONB,                -- assistant tool_use blocks
  tool_results JSONB,              -- tool_result payloads (for role='tool')
  actor TEXT,                      -- 'user:<email>' or 'agent:ops-chat'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_chat_prospect ON prospect_chat_messages(prospect_id, created_at);
