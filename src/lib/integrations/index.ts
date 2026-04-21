import type { BookingAdapter, AdapterContext } from "./types";
import boulevard from "./boulevard";
import acuity from "./acuity";
import mindbody from "./mindbody";
import square from "./square";
import zenoti from "./zenoti";
import vagaro from "./vagaro";
import jane from "./jane";
import wellnessliving from "./wellnessliving";
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
  acuity,
  mindbody,
  square,
  zenoti,
  vagaro,        // hybrid: availability only
  jane,          // hybrid: availability only
  wellnessliving,
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
  // Both direct_book AND hybrid tenants use the adapter — direct_book
  // for full read+write, hybrid for read-only availability. sms_fallback
  // tenants skip the adapter entirely. booking.ts separately gates writes
  // on integration_mode === "direct_book".
  if (tenant.integration_mode !== "direct_book" && tenant.integration_mode !== "hybrid") {
    return null;
  }
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
