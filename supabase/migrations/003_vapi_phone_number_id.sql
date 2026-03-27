-- Add Vapi phone number ID to tenants for fast lookup on inbound calls
alter table tenants add column if not exists vapi_phone_number_id text unique;
create index if not exists idx_tenants_vapi_phone_number_id on tenants(vapi_phone_number_id);
