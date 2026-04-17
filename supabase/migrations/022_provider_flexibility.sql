-- 022_provider_flexibility.sql
-- Captures whether the caller is flexible on provider if their first choice
-- isn't available. Asked at the same time as the primary provider preference,
-- because it's part of the same conversational beat — not a late-stage backup.

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS provider_flexibility text;

COMMENT ON COLUMN booking_requests.provider_flexibility IS
  'Free-text capture of the caller''s willingness to see a different provider '
  'if their primary choice is unavailable. Examples: "open to any aesthetician", '
  '"prefers Dr. Sarah but would see Dr. Mia", "would rather wait for Dr. Sarah". '
  'Null when caller had no provider preference to begin with.';
