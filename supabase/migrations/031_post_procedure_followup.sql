-- Migration: Post-Procedure Follow-Up SMS
--
-- Adds the data layer for treatment-specific aftercare SMS sent after a
-- client's appointment is marked completed. Wrapper template is fixed in
-- code (src/lib/sms/templates.ts) for HIPAA-compliant copy. Tenants only
-- author the per-treatment guideline body that gets interpolated in.
--
-- HIPAA notes:
--   - calendar_events gains explicit consent + completion fields so we can
--     prove (a) the patient agreed to receive aftercare SMS and (b) who
--     marked their visit complete.
--   - sms_opt_outs lives at the (tenant, phone) level so STOP replies
--     persist across future bookings.
--   - appointment_audit_log captures every state change for the 6-year
--     HIPAA retention requirement.

-- ─── tenants: post-visit followup toggle + delay ──────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS sms_followup_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_followup_hours INTEGER NOT NULL DEFAULT 24
    CHECK (sms_followup_hours IN (2, 24, 48, 168));

-- Drop the legacy customizable reminder-template column. Reminder, confirmation,
-- and followup templates now live in code (src/lib/sms/templates.ts) — only on/off
-- toggles and delay hours are tenant-configurable. Leaving the column would be
-- dead schema and an invitation to reintroduce tenant-authored SMS copy.
ALTER TABLE tenants
  DROP COLUMN IF EXISTS sms_reminder_template;

-- ─── calendar_events: completion + consent capture ────────────────────────
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_source TEXT
    CHECK (completion_source IN ('manual', 'webhook_boulevard', 'webhook_mindbody', 'webhook_square', 'system')),
  ADD COLUMN IF NOT EXISTS sms_consent_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_consent_source TEXT
    CHECK (sms_consent_source IN ('verbal_call', 'web_form', 'imported')),
  ADD COLUMN IF NOT EXISTS sms_consent_call_id UUID REFERENCES call_logs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sms_consent_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_calendar_events_completed
  ON calendar_events(tenant_id, completed_at)
  WHERE completed_at IS NOT NULL;

-- ─── post_procedure_templates: per-service aftercare body ─────────────────
-- service_name matches calendar_events.service_type (case-insensitive lookup
-- is the responsibility of the cron sender, not the schema).
CREATE TABLE IF NOT EXISTS post_procedure_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  guideline_text TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, service_name)
);

CREATE INDEX IF NOT EXISTS idx_post_procedure_templates_tenant
  ON post_procedure_templates(tenant_id);

ALTER TABLE post_procedure_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read templates"
  ON post_procedure_templates FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "tenant members write templates"
  ON post_procedure_templates FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  ));

-- ─── sms_sent_log: idempotency + audit for outbound SMS ───────────────────
-- Cron sender writes one row per (calendar_event_id, template_type) BEFORE
-- attempting send so retries don't double-text.
CREATE TABLE IF NOT EXISTS sms_sent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('confirmation', 'reminder', 'followup')),
  to_phone TEXT NOT NULL,
  body_preview TEXT,           -- first 200 chars of rendered body, for audit
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped_no_consent', 'skipped_opted_out')),
  provider TEXT,               -- 'vapi' | 'twilio'
  provider_message_id TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (calendar_event_id, template_type)
);

CREATE INDEX IF NOT EXISTS idx_sms_sent_log_tenant
  ON sms_sent_log(tenant_id, sent_at DESC);

-- ─── sms_opt_outs: STOP replies persist across all future bookings ────────
CREATE TABLE IF NOT EXISTS sms_opt_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT CHECK (source IN ('stop_reply', 'manual', 'imported')),
  UNIQUE (tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_lookup
  ON sms_opt_outs(tenant_id, phone_number);

-- ─── appointment_audit_log: HIPAA audit trail (6-year retention) ──────────
-- Records every state change on a calendar_event so we can answer "who did
-- what when" during a compliance review or breach investigation.
CREATE TABLE IF NOT EXISTS appointment_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL when source = system/webhook
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'completed', 'cancelled', 'no_show', 'consent_granted', 'consent_revoked')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'webhook_boulevard', 'webhook_mindbody', 'webhook_square', 'verbal_call', 'system')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_audit_event
  ON appointment_audit_log(calendar_event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointment_audit_tenant
  ON appointment_audit_log(tenant_id, created_at DESC);
