-- Client Intelligence Phase 1
-- Two tables: client_profiles (one row per caller per tenant) + client_profile_updates (audit log).
-- Ownership model:
--   Ours:       call data, AI memory, personalization signals
--   Theirs:     appointments, payments, clinical records (stay in booking platform)
--   Cached:    name / email / preferences — refreshed from booking platform on call start when integrated

CREATE TABLE IF NOT EXISTS client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone text NOT NULL,

  -- Identity (cached from booking platform when available, else collected by AI)
  first_name text,
  last_name text,
  email text,

  -- Aggregate counters (ours, updated by voice agent)
  total_calls int NOT NULL DEFAULT 0,
  total_bookings int NOT NULL DEFAULT 0,
  last_call_at timestamptz,
  last_booking_at timestamptz,
  last_service text,
  last_provider text,

  -- Personalization signals (ours)
  preferred_provider text,
  preferred_time text,
  referral_source text,
  tags text[] NOT NULL DEFAULT '{}',
  staff_notes text,

  -- Privacy escape hatch — if true, AI greets generically and does not reference history
  no_personalization boolean NOT NULL DEFAULT false,

  -- External references to booking platform client IDs, keyed by provider
  -- e.g. { "boulevard": "client_abc123", "acuity": "45678" }
  provider_refs jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Rolling window of recent calls (summary + outcome), capped in app code
  -- [{ call_id, started_at, duration_seconds, summary, booked, service }]
  call_history jsonb NOT NULL DEFAULT '[]'::jsonb,

  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_client_profiles_tenant_phone
  ON client_profiles(tenant_id, phone);

CREATE INDEX IF NOT EXISTS idx_client_profiles_last_call
  ON client_profiles(tenant_id, last_call_at DESC);

-- Audit log — every change to a profile field (except counter bumps) is recorded here
CREATE TABLE IF NOT EXISTS client_profile_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES client_profiles(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  source text NOT NULL,        -- 'ai_call' | 'staff_dashboard' | 'booking_sync' | 'webhook'
  source_detail text,          -- call_id, user email, platform name, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_profile_updates_profile
  ON client_profile_updates(client_profile_id, created_at DESC);
