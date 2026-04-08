-- Migration: Booking integration support (5 modes)

-- Add booking provider config to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS booking_provider TEXT DEFAULT 'internal' 
    CHECK (booking_provider IN ('internal', 'vagaro', 'acuity', 'mindbody', 'link')),
  ADD COLUMN IF NOT EXISTS booking_config JSONB;

-- Internal booking requests table (used for internal mode + fallback logging)
CREATE TABLE IF NOT EXISTS booking_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  preferred_date DATE,
  preferred_time TIME,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  referred_by TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  external_booking_id TEXT,  -- For storing Vagaro/Acuity/Mindbody confirmation IDs
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_tenant_id ON booking_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests(status);

-- RLS
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage own booking requests" ON booking_requests
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role can insert bookings" ON booking_requests
  FOR INSERT WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER booking_requests_updated_at
  BEFORE UPDATE ON booking_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Comments
COMMENT ON TABLE booking_requests IS 'Booking requests - used for internal mode + fallback logging for all modes';
COMMENT ON COLUMN tenants.booking_provider IS 'Booking system: internal (DB), vagaro, acuity, mindbody, or link (send URL)';
COMMENT ON COLUMN tenants.booking_config IS 'Provider config: {merchantId, apiKey} for Vagaro, {userId, apiKey} for Acuity, {siteId, apiKey} for Mindbody, {bookingUrl} for link mode';
COMMENT ON COLUMN booking_requests.external_booking_id IS 'Confirmation ID from external booking system (Vagaro/Acuity/Mindbody)';
