import { supabaseAdmin } from "./supabase";
import { Tenant } from "@/types";

/**
 * Look up a tenant by their Vapi phone number string e.g. "+14155551234"
 */
export async function getTenantByPhoneNumber(
  phoneNumber: string
): Promise<Tenant | null> {
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("*")
    .eq("phone_number", phoneNumber)
    .single();

  if (error || !data) return null;
  return data as Tenant;
}

/**
 * Look up a tenant by their Vapi phone number ID (UUID from Vapi's API)
 */
export async function getTenantByVapiPhoneNumberId(
  vapiPhoneNumberId: string
): Promise<Tenant | null> {
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("*")
    .eq("vapi_phone_number_id", vapiPhoneNumberId)
    .single();

  if (error || !data) return null;
  return data as Tenant;
}

/**
 * Get tenant by ID
 */
export async function getTenantById(id: string): Promise<Tenant | null> {
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as Tenant;
}

/**
 * List all tenants
 */
export async function listTenants(): Promise<Tenant[]> {
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("*")
    .order("name");

  if (error) throw error;
  return (data || []) as Tenant[];
}

/**
 * Create a new tenant
 */
export async function createTenant(
  tenant: Omit<Tenant, "id" | "created_at" | "updated_at">
): Promise<Tenant> {
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .insert(tenant)
    .select()
    .single();

  if (error) throw error;
  return data as Tenant;
}

/**
 * Update an existing tenant
 */
export async function updateTenant(
  id: string,
  updates: Partial<Tenant>
): Promise<Tenant> {
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Tenant;
}
