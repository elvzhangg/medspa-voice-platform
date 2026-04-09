-- Migration: Stripe payment integration

-- Add Stripe fields to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_webhook_secret TEXT;

-- Create payment_requests table for tracking payment attempts
CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  customer_phone TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed', 'failed')),
  stripe_payment_link TEXT,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_tenant_id ON payment_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);

-- RLS
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view own payment requests" ON payment_requests
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role can manage payments" ON payment_requests
  FOR ALL USING (true);

-- Trigger for updated_at
CREATE TRIGGER payment_requests_updated_at
  BEFORE UPDATE ON payment_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE payment_requests IS 'Payment requests - AI can trigger payment links via Stripe';
COMMENT ON COLUMN tenants.stripe_account_id IS 'Stripe Connected Account ID for the tenant';