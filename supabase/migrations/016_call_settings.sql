-- Migration: AI Voice and Call Settings

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS ai_voice_id TEXT DEFAULT 'rachel',
ADD COLUMN IF NOT EXISTS ai_speed DECIMAL(3,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS ai_pitch DECIMAL(3,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS call_recording_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS voicemail_forwarding_number TEXT;

COMMENT ON COLUMN tenants.ai_voice_id IS 'ElevenLabs Voice ID or provider slug';
COMMENT ON COLUMN tenants.voicemail_forwarding_number IS 'Number to forward to if the AI cannot handle the call';
