-- Migration: Invite-based onboarding

-- Add invite code to tenants (short, shareable code)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- Generate random invite codes for existing tenants
UPDATE tenants
SET invite_code = lower(substring(md5(random()::text) from 1 for 8))
WHERE invite_code IS NULL;

-- Function to generate a new random invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    code := lower(substring(md5(random()::text) from 1 for 8));
    SELECT EXISTS(SELECT 1 FROM tenants WHERE invite_code = code) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN code;
END;
$$;

-- Trigger to auto-generate invite codes for new tenants
CREATE OR REPLACE FUNCTION set_invite_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_invite_code();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_set_invite_code
  BEFORE INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION set_invite_code();

-- Comment
COMMENT ON COLUMN tenants.invite_code IS 'Short invite code for customer signup links (e.g. vauxvoice.com/auth/signup?invite=abc12345)';
