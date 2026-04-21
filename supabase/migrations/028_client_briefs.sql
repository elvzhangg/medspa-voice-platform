-- Migration 028: per-client AI-generated summary + HIPAA access audit log
--
-- Two things here:
--
-- 1. Add a running "what we know about this client" summary to
--    client_profiles. This is distinct from call_logs.summary (which is
--    per-call); this is a consolidated prose narrative across all the
--    client's interactions, read by:
--      - the new /api/clients/[id]/brief endpoint (staff pre-appointment)
--      - the voice AI at call time (so returning callers get smart greetings)
--    Regenerated after each call via the Vapi end-of-call webhook.
--
-- 2. A chat_access_audit table. Even Tier 1 of the chat feature (brief
--    only, no chatbot yet) pulls PHI-adjacent data on behalf of a named
--    staff user — HIPAA wants a record of "who viewed which client when"
--    separate from the retrieval log ("what sources the AI read").

ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS summary_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary_source_call_ids uuid[] DEFAULT '{}';

COMMENT ON COLUMN client_profiles.summary IS
  'Rolling prose summary of what we know about this client across all '
  'interactions. Regenerated after each call via the end-of-call webhook. '
  'Read by the brief endpoint and the voice AI system prompt.';

COMMENT ON COLUMN client_profiles.summary_source_call_ids IS
  'call_logs.id values that fed into the current summary. Used to invalidate '
  'when a call is deleted or amended, and to show provenance in the UI.';

CREATE TABLE IF NOT EXISTS chat_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_profile_id uuid REFERENCES client_profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'brief_view',         -- staff opened a client brief
    'chat_query',         -- staff asked the chatbot a question (future)
    'summary_regenerate'  -- on-demand summary refresh (future)
  )),
  -- Freeform context: route, user agent, chat query text, etc.
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_access_audit_tenant_created
  ON chat_access_audit(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_access_audit_client
  ON chat_access_audit(client_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_access_audit_user
  ON chat_access_audit(user_id, created_at DESC);

ALTER TABLE chat_access_audit ENABLE ROW LEVEL SECURITY;

-- Staff can read their own tenant's audit log (for transparency / self-audit)
CREATE POLICY "tenant_users_read_own_audit"
  ON chat_access_audit
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Inserts only via service role (server-side API routes) — never from the
-- client. No INSERT policy means RLS blocks anon/authenticated inserts.
