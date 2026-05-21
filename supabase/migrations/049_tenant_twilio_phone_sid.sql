-- Migration: Tenant Twilio Phone SID
-- Adds twilio_phone_sid so we can release Twilio numbers we bought when a
-- tenant is deleted or migrated. The Twilio "IncomingPhoneNumber" SID (PN...)
-- is returned at purchase time and is required by Twilio's DELETE endpoint.
--
-- This pairs with tenant.twilio_phone_number (E.164) which is the number
-- itself. SID is the API handle; number is the human-readable identifier.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS twilio_phone_sid TEXT;

COMMENT ON COLUMN tenants.twilio_phone_sid IS
  'Twilio IncomingPhoneNumber SID (PN...) for the number stored in twilio_phone_number. Required to release the number via Twilio DELETE when the tenant is removed or migrated.';
