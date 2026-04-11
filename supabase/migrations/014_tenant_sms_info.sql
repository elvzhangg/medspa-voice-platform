-- Migration: Add directions and parking info

ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS directions_parking_info TEXT;

COMMENT ON COLUMN tenants.directions_parking_info IS 'Custom text included in automated SMS confirmations (parking, gate codes, prep instructions)';
