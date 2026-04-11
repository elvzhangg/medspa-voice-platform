-- Migration: SMS and Messaging Settings

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS sms_reminders_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sms_reminder_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS sms_reminder_template TEXT;

COMMENT ON COLUMN tenants.sms_reminders_enabled IS 'Toggle to enable/disable automated appointment reminders';
COMMENT ON COLUMN tenants.sms_reminder_template IS 'Custom text appended to the standard reminder SMS';
