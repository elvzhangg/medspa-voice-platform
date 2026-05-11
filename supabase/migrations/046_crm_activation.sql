-- Migration: CRM activation flow
-- Adds the link between a CRM prospect and the tenant created on activation,
-- plus an activation_state JSONB that holds drafts + per-step chat history
-- across the multi-turn "Activate" wizard. The wizard is review-and-revise,
-- so drafts may sit in this JSONB for hours/days between turns.

ALTER TABLE crm_prospects
  -- The tenant created when the prospect is activated. Set by the activation
  -- wizard's tenant-commit step. SET NULL on tenant delete so prospects don't
  -- get cascade-removed if a tenant is purged.
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,

  -- Holds the in-flight wizard state. Shape:
  --   {
  --     "tenant":    { draft, committed_at, chat: [{role,content,at}] },
  --     "number":    { draft: {area_code, status: "pending"|"provisioned"|"failed"},
  --                    phone_number, vapi_phone_number_id, last_error,
  --                    committed_at, chat: [...] },
  --     "knowledge": { draft: {chunks: [...]}, committed_at, chunks_inserted, chat: [...] },
  --     "email":     { draft: {subject, body}, sent_at, chat: [...] }
  --   }
  -- Each step's `chat` is an append-only log of {role, content, at} turns
  -- between admin user and the per-step Claude agent.
  ADD COLUMN IF NOT EXISTS activation_state JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_crm_prospects_tenant_id ON crm_prospects(tenant_id);
