-- Migration: Admin Outreach Campaigns (for VauxVoice internal use)

CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  target_regions TEXT[], -- e.g. ['California', 'New York']
  target_platforms TEXT[], -- e.g. ['Acuity', 'Boulevard', 'Mindbody']
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outreach_prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  website TEXT,
  email TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  booking_platform TEXT, -- 'Acuity' | 'Boulevard' | 'Mindbody' | 'Other'
  services_summary TEXT,
  pricing_notes TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'researched', 'contacted', 'demo_scheduled', 'demo_tested', 'converted', 'archived')),
  assigned_demo_number TEXT, -- dedicated Vapi number provisioned for this prospect
  notes TEXT,
  contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_prospects_campaign ON outreach_prospects(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_prospects_status ON outreach_prospects(status);
CREATE INDEX IF NOT EXISTS idx_outreach_prospects_state ON outreach_prospects(state);

-- Admin-only via service role (no RLS needed — only supabaseAdmin accesses these)
