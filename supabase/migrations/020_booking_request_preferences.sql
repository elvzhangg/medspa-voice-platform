-- Migration: Capture backup slot preferences on booking requests
-- Stores the caller's flexibility info so staff can confirm with full context.

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS backup_slots text,         -- e.g. "also Thursday mornings or any Friday"
  ADD COLUMN IF NOT EXISTS time_preference text,      -- e.g. "mornings before noon", "afternoons"
  ADD COLUMN IF NOT EXISTS provider_preference text;  -- e.g. "prefers Dr. Sarah", "no preference"
