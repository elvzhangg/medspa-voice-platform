-- Migration: SMS Appointment Confirmations

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS sms_confirmation_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN tenants.sms_confirmation_enabled IS 'Toggle to enable/disable automated appointment confirmation texts';
