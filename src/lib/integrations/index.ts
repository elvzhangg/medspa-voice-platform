import type { BookingAdapter, AdapterContext } from "./types";
import boulevard from "./boulevard";
import { supabaseAdmin } from "../supabase";

/**
 * Platform → adapter map. Only direct-book platforms appear here.
 * SMS-fallback platforms (Fresha, GlossGenius, Jane, self-managed) have
 * no adapter — they're handled by the SMS forward flow in booking.ts.
 *
 * To add a new direct-book platform:
 *   1. Build src/lib/integrations/<platform>.ts implementing BookingAdapter
 *   2. Import + register it here
 *   3. Add its credential/config field spec to the admin integration UI
 */
const REGISTRY: Record<string, BookingAdapter | undefined> = {
  boulevard,
  // acuity:   (pending — will port from booking.ts)
  // mindbody: (pending)
  // square:   (pending)
  // zenoti:   (pending)
};

export function getAdapter(platform: string | null | undefined): BookingAdapter | null {
  if (!platform) return null;
  return REGISTRY[platform] ?? null;
}

/**
 * Load a tenant's integration context (credentials + config) from the
 * admin-managed tenant_integrations table. Returns null if no row
 * exists or the tenant isn't marked connected.
 */
export async function loadTenantIntegration(
  tenantId: string
): Promise<{ adapter: BookingAdapter; ctx: AdapterContext } | null> {
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("integration_platform, integration_mode, integration_status")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant) return null;
  if (tenant.integration_mode !== "direct_book") return null;
  if (tenant.integration_status !== "connected") return null;

  const adapter = getAdapter(tenant.integration_platform);
  if (!adapter) return null;

  const { data: row } = await supabaseAdmin
    .from("tenant_integrations")
    .select("credentials, config")
    .eq("tenant_id", tenantId)
    .eq("platform", tenant.integration_platform)
    .maybeSingle();

  if (!row) return null;

  return {
    adapter,
    ctx: {
      credentials: (row.credentials ?? {}) as Record<string, string | undefined>,
      config: (row.config ?? {}) as Record<string, string | undefined>,
    },
  };
}
