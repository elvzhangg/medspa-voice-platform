-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referred_by_name TEXT,
  referred_by_phone TEXT,
  new_patient_name TEXT,
  new_patient_phone TEXT,
  source TEXT DEFAULT 'phone', -- 'phone', 'manual', 'campaign'
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'rewarded'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS referrals_tenant_id_idx ON referrals(tenant_id);

-- RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant owners can manage referrals" ON referrals
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );
