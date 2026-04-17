-- Migration: Add staff-forward booking notification workflow
-- When a booking provider API isn't available, the AI captures appointment
-- details and texts the designated staff/managers to confirm with the patient.

-- Add staff-forward settings to tenants table
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS booking_forward_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_forward_phones text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS booking_forward_sms_template text NOT NULL DEFAULT
    '📋 New booking request via AI receptionist

Patient: [CustomerName]
Phone: [CustomerPhone]
Service: [Service]
Requested: [DateTime]
Notes: [Notes]

Please call or text to confirm their appointment.
— [ClinicName] VauxVoice';

-- Track which staff numbers were notified and when
ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS forwarded_to text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS forward_sent_at timestamptz;

-- Index to quickly find forwarded requests on the dashboard
CREATE INDEX IF NOT EXISTS idx_booking_requests_forward_sent_at
  ON booking_requests (tenant_id, forward_sent_at DESC NULLS LAST);
