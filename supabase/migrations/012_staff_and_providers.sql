-- Migration: Staff and Provider Management

-- Create staff table
CREATE TABLE IF NOT EXISTS staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT, -- e.g. "Nurse Injector", "Esthetician"
  services TEXT[], -- Array of services they provide
  working_hours JSONB DEFAULT '{
    "monday": {"open": "09:00", "close": "17:00"},
    "tuesday": {"open": "09:00", "close": "17:00"},
    "wednesday": {"open": "09:00", "close": "17:00"},
    "thursday": {"open": "09:00", "close": "17:00"},
    "friday": {"open": "09:00", "close": "17:00"}
  }',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link calendar events to specific staff
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_tenant_id ON staff(tenant_id);

-- RLS
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage own staff" ON staff
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role can view staff" ON staff
  FOR ALL USING (true);

-- Insert a default staff for Glow Med Spa
INSERT INTO staff (tenant_id, name, title, services)
VALUES ('00000000-0000-0000-0000-000000000001', 'Nurse Sarah', 'Nurse Injector', '{Botox, Filler, Lip Flip}');
