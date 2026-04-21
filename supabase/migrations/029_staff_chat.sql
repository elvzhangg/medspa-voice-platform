-- Migration 029: Staff chat (Tier 2)
--
-- Three new tables for the staff-facing chatbot at /dashboard/assistant:
--   * chat_conversations — one row per chat session, scoped to (tenant, user)
--   * chat_messages — individual turns within a conversation
--   * chat_feedback — thumbs up/down per assistant message, keyed on
--     (conversation, message, user) so one user's opinion can't overwrite
--     another's, and so we can swap prompt versions and tell which round
--     of feedback belongs to which prompt.
--
-- Plus: a summary embedding column on client_profiles. When the brief
-- generator writes a rolling summary we also compute a pgvector so the
-- chat layer can do semantic cross-client search ("who mentioned a
-- wedding?") without scanning every summary in context. Same pattern
-- and extension the Clinic Handbook already uses.

-- ─── Summary embeddings on client_profiles ───────────────────────────

ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS summary_embedding vector(1536);

COMMENT ON COLUMN client_profiles.summary_embedding IS
  'OpenAI text-embedding-3-small vector of client_profiles.summary. '
  'Updated whenever summary is regenerated; powers cross-client semantic '
  'search in the staff chatbot.';

-- ivfflat over cosine distance is the pattern already in use for
-- knowledge_base_documents; mirror it here.
CREATE INDEX IF NOT EXISTS idx_client_profiles_summary_embedding
  ON client_profiles USING ivfflat (summary_embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── chat_conversations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Optional: conversation started from a specific client's profile page.
  -- Lets the UI show "chat about Sarah" vs "general chat" in the history.
  client_profile_id uuid REFERENCES client_profiles(id) ON DELETE SET NULL,
  title text,                     -- auto-summarized from the first user message
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant_user
  ON chat_conversations(tenant_id, user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_client
  ON chat_conversations(client_profile_id, updated_at DESC);

-- ─── chat_messages ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content text NOT NULL,
  -- For assistant turns: list of tool calls made and client_profile_ids
  -- touched so we can show sources + feed chat_access_audit. For tool
  -- turns: which tool ran and its structured result. Free shape, keep
  -- it loose until we know what we actually want.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Prompt version feedback attaches to, so thumbs-down from prompt v1
  -- doesn't mix with thumbs-down from prompt v2 when we iterate.
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant
  ON chat_messages(tenant_id, created_at DESC);

-- ─── chat_feedback ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating IN (-1, 1)),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)  -- one rating per user per message, upsertable
);

CREATE INDEX IF NOT EXISTS idx_chat_feedback_tenant
  ON chat_feedback(tenant_id, created_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_feedback ENABLE ROW LEVEL SECURITY;

-- A staff user can only see their own conversations (plus admins could
-- see all within their tenant — not modeling that yet).
CREATE POLICY "own_conversations_select"
  ON chat_conversations
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

CREATE POLICY "own_conversation_messages_select"
  ON chat_messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM chat_conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "own_feedback_rw"
  ON chat_feedback
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Writes go through the server/service role, not directly from the client,
-- so no INSERT policies. If we ever allow direct client inserts, we add
-- them then — default-deny is the safe posture.

-- ─── Semantic search RPC ─────────────────────────────────────────────
-- Used by the staff chat's `search_clients_by_keyword` tool. Scoped by
-- tenant at the function boundary so callers physically can't reach
-- another tenant's clients even if they pass a forged embedding.

CREATE OR REPLACE FUNCTION match_client_summaries(
  p_tenant_id uuid,
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  phone text,
  first_name text,
  last_name text,
  summary text,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    cp.id,
    cp.phone,
    cp.first_name,
    cp.last_name,
    cp.summary,
    1 - (cp.summary_embedding <=> p_query_embedding) AS similarity
  FROM client_profiles cp
  WHERE cp.tenant_id = p_tenant_id
    AND cp.summary_embedding IS NOT NULL
  ORDER BY cp.summary_embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;
