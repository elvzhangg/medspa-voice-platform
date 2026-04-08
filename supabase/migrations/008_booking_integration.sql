-- Migration: Booking integration support

-- Add booking provider config to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS booking_provider TEXT DEFAULT 'internal' CHECK (booking_provider IN ('internal', 'acuity', 'calendly')),
  ADD COLUMN IF NOT EXISTS booking_config JSONB;

-- Internal booking requests table (fallback when no external provider)
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

-- Service role can insert (for webhook)
CREATE POLICY "Service role can insert bookings" ON booking_requests
  FOR INSERT WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER booking_requests_updated_at
  BEFORE UPDATE ON booking_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Comment
COMMENT ON TABLE booking_requests IS 'Internal booking requests when tenant uses internal mode or external booking fails';
COMMENT ON COLUMN tenants.booking_provider IS 'Which booking system: internal (DB only), acuity, or calendly';
COMMENT ON COLUMN tenants.booking_config IS 'Provider-specific config: {userId, apiKey} for Acuity, {schedulingUrl} for Calendly';
