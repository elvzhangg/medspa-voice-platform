-- Migration 039: client_profiles membership + sales summary
--
-- Lets the AI greet returning clients with grounded membership context
-- ("you have 3 HydraFacials remaining on your Glow Gold membership"
-- before quoting full price). Also extends lifetime-spend tracking
-- beyond visits to include retail and package purchases.
--
-- All four columns are CACHE — populated by getClientHistory pulls from
-- the booking platform. Source of truth lives on the platform; we keep
-- a denormalized snapshot here for fast read-on-call-start. Stale-after
-- 24h reuses the existing client_profiles.last_synced_at TTL.

ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS total_sales_cents integer,
  ADD COLUMN IF NOT EXISTS last_purchase_at  timestamptz,
  ADD COLUMN IF NOT EXISTS active_memberships jsonb,
  ADD COLUMN IF NOT EXISTS package_balances   jsonb;

COMMENT ON COLUMN client_profiles.total_sales_cents IS
  'Lifetime spend in cents — sum of all platform sales (services + retail '
  '+ packages + memberships). Distinct from lifetime_value_cents which '
  'historically counted visit completions only.';

COMMENT ON COLUMN client_profiles.last_purchase_at IS
  'Most recent platform sale timestamp. Includes retail-only walk-throughs '
  'where the client did not have an appointment.';

COMMENT ON COLUMN client_profiles.active_memberships IS
  'JSON array of active recurring memberships. Schema per item: '
  '{ external_id, name, program, remaining, total, expires_at, monthly_cost_cents }. '
  'Read by the AI on call start to mention member-only benefits.';

COMMENT ON COLUMN client_profiles.package_balances IS
  'JSON array of one-time packages with sessions remaining. Same schema '
  'as active_memberships. Read by the AI to remind callers of unused credits '
  '("you have 2 laser sessions left on your 6-pack, expiring May 15").';
