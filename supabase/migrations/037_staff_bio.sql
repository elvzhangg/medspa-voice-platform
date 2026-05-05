-- Migration 037: staff bio for richer provider cards
--
-- Mindbody / Boulevard / Acuity all expose a "bio" / "about me" string on
-- their staff endpoints. We weren't pulling it. Add the column so the
-- next provider sync populates it.
--
-- Conflict policy mirrors the rest of the platform-sourced fields in
-- migration 027: bio is OVERWRITTEN on each sync (the platform owns the
-- text). Tenant-authored fields (ai_notes, specialties) remain untouched.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS bio text;

COMMENT ON COLUMN staff.bio IS
  'About-me / bio text pulled from the booking platform staff record. '
  'Read-only here — overwritten on each provider sync. Platforms that '
  'don''t expose it (or internal-only tenants) leave it null.';
