import type { BookingAdapter, AdapterContext, TenantSchedulingData } from "./types";
import boulevard from "./boulevard";
import acuity from "./acuity";
import mindbody from "./mindbody";
import square from "./square";
import zenoti from "./zenoti";
import vagaro from "./vagaro";
import jane from "./jane";
import wellnessliving from "./wellnessliving";
import googleCalendar from "./google-calendar";
import { supabaseAdmin } from "../supabase";
import { ensureFreshAccessToken } from "../google-oauth";

// Adapters that compute availability themselves (rather than deferring to a
// platform's scheduler) need tenant-level scheduling data: per-provider working
// hours from staff.working_hours, plus service durations + buffer from
// tenants.booking_settings. Listed here so we only do the extra DB work when
// it's actually going to be read.
const ADAPTERS_NEEDING_TENANT_DATA = new Set(["google_calendar"]);

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
  google_calendar: googleCalendar, // direct-book via Google Calendar API
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

  const credentials = (row.credentials ?? {}) as Record<string, string | undefined>;

  // Google Calendar uses OAuth tokens (stored in oauth_* columns, not in
  // credentials) — refresh if needed and inject into ctx.credentials.access_token
  // so the adapter can read it like any other API key. Other adapters are
  // unaffected.
  if (tenant.integration_platform === "google_calendar") {
    try {
      const accessToken = await ensureFreshAccessToken(tenantId);
      credentials.access_token = accessToken;
    } catch (err) {
      console.error("GOOGLE_OAUTH_REFRESH_FAILED:", err);
      return null;
    }
  }

  // Fetch tenant scheduling data (staff.working_hours + tenants.booking_settings)
  // for adapters that compute availability themselves. Other adapters skip
  // this query entirely.
  let tenantData: TenantSchedulingData | undefined;
  if (
    tenant.integration_platform &&
    ADAPTERS_NEEDING_TENANT_DATA.has(tenant.integration_platform)
  ) {
    tenantData = await loadTenantSchedulingData(tenantId);
  }

  return {
    adapter,
    ctx: {
      credentials,
      config: (row.config ?? {}) as Record<string, string | undefined>,
      tenantData,
    },
  };
}

/**
 * Build the TenantSchedulingData blob for a tenant by reading active staff
 * working hours and the tenant's booking_settings. Used by adapters (currently
 * google_calendar) that compute availability themselves rather than delegating
 * to a platform's scheduler.
 *
 * Failures degrade gracefully — a missing booking_settings row falls back to
 * sensible defaults (60-min appointments, no buffer); missing staff means
 * the adapter will use its own 09-17 hardcoded fallback.
 */
async function loadTenantSchedulingData(
  tenantId: string
): Promise<TenantSchedulingData> {
  const [staffRes, tenantRes] = await Promise.all([
    supabaseAdmin
      .from("staff")
      .select("name, working_hours")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    supabaseAdmin
      .from("tenants")
      .select("booking_settings")
      .eq("id", tenantId)
      .maybeSingle(),
  ]);

  // Build provider-name -> day -> hours map. Normalize names to lowercase for
  // matching but preserve readable casing isn't important — adapter does
  // case-insensitive matching on the way out.
  const workingHoursByProvider: Record<
    string,
    Record<string, { open: string; close: string }>
  > = {};
  for (const row of (staffRes.data ?? []) as Array<{
    name: string;
    working_hours: Record<string, { open: string; close: string }> | null;
  }>) {
    if (!row.name || !row.working_hours) continue;
    workingHoursByProvider[row.name] = row.working_hours;
  }

  // Parse booking_settings. The column has a JSONB default so tenants created
  // post-migration 040 always have a row; for older tenants the migration
  // backfilled defaults, but we still defend with a fallback.
  type BookingSettings = {
    service_durations?: Record<string, number>;
    buffer_min?: number;
  };
  const settings: BookingSettings =
    (tenantRes.data?.booking_settings as BookingSettings | null | undefined) ?? {};

  // Coerce service durations to numbers + lowercase keys for case-insensitive
  // matching. Skip values that don't parse to positive integers.
  const serviceDurations: Record<string, number> = {};
  if (settings.service_durations && typeof settings.service_durations === "object") {
    for (const [k, v] of Object.entries(settings.service_durations)) {
      const n = typeof v === "number" ? v : parseInt(String(v), 10);
      if (!isNaN(n) && n > 0) serviceDurations[k.toLowerCase()] = n;
    }
  }
  // Always have a "default" — if tenant didn't set one, use 60.
  if (serviceDurations["default"] === undefined) serviceDurations["default"] = 60;

  const bufferMin =
    typeof settings.buffer_min === "number" && settings.buffer_min >= 0
      ? settings.buffer_min
      : 0;

  return {
    workingHoursByProvider,
    serviceDurations,
    bufferMin,
  };
}
