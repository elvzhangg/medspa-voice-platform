import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { runFullTenantSync } from "@/lib/appointment-sync";

/**
 * Tenant-side "Sync now" trigger. Fans out:
 *   1. Provider roster pull (same path as the daily cron)
 *   2. Appointment backfill in [-30d, +90d] — webhook safety net
 *   3. Bumps tenant_integrations.last_synced_at so the dashboard shows
 *      a fresh timestamp.
 *
 * Cooldown: 30s server-side floor. Stops accidental click-spam from
 * hammering platform APIs (Mindbody in particular gates aggressively).
 *
 * Auth: tenant session via getCurrentTenant — does NOT expose
 * credentials/config. The sync code paths read those server-side from
 * tenant_integrations using the service role.
 */

const COOLDOWN_MS = 30_000;

// First sync against a fresh tenant fans out N pages of platform pulls
// + bulk upserts; the longest path observed is ~30s on a populated
// Mindbody site. Set the ceiling to 5 min so we don't truncate on
// outliers (large directories, slow platform responses). Vercel only
// bills for actual run-time, not the ceiling.
export const maxDuration = 300;

export async function POST() {
  const tenant = (await getCurrentTenant()) as
    | {
        id: string;
        integration_status?: string | null;
        integration_platform?: string | null;
      }
    | null;
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (tenant.integration_status !== "connected") {
    return NextResponse.json(
      { error: "Integration not connected" },
      { status: 400 }
    );
  }

  if (!tenant.integration_platform) {
    return NextResponse.json(
      { error: "No platform configured for this tenant" },
      { status: 400 }
    );
  }

  // Cooldown check — read the existing last_synced_at and bail if it's
  // within COOLDOWN_MS of now. The check + the eventual write are not
  // transactional, but two near-simultaneous clicks would still cost at
  // most one extra round-trip; not worth a row lock here.
  //
  // Filter by (tenant_id, platform) — a tenant can have multiple rows in
  // tenant_integrations (e.g., a stale row from a previous platform that
  // wasn't explicitly disconnected before switching). Without the platform
  // filter, .maybeSingle() throws on multi-row matches and surfaces as
  // "No integration row" even though the active integration exists.
  const { data: integration } = await supabaseAdmin
    .from("tenant_integrations")
    .select("platform, last_synced_at")
    .eq("tenant_id", tenant.id)
    .eq("platform", tenant.integration_platform)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json(
      {
        error: `No integration row for platform=${tenant.integration_platform}. Reconnect via /dashboard/integrations.`,
      },
      { status: 400 }
    );
  }

  if (integration.last_synced_at) {
    const elapsed = Date.now() - new Date(integration.last_synced_at).getTime();
    if (elapsed < COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: "Cooldown — try again shortly", retryAfterSec },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }
  }

  const result = await runFullTenantSync(tenant.id);

  // If both platform-touching phases errored, surface the failure so
  // the UI can show a toast. Client aggregation is a pure DB pass; an
  // error there doesn't indicate platform trouble, so it doesn't gate
  // the response status.
  const bothErrored = result.providers.errored && result.appointments.errored;
  const status = bothErrored ? 502 : 200;
  return NextResponse.json(
    {
      ok: !bothErrored,
      platform: integration.platform,
      last_synced_at: result.syncedAt,
      providers: {
        fetched: result.providers.fetched,
        upserted: result.providers.upserted,
        deactivated: result.providers.deactivated,
        errored: result.providers.errored,
        error: result.providers.errorMessage,
      },
      appointments: {
        fetched: result.appointments.fetched,
        upserted: result.appointments.upserted,
        errored: result.appointments.errored,
        error: result.appointments.errorMessage,
      },
      clientDirectory: {
        fetched: result.clientDirectory.fetched,
        upserted: result.clientDirectory.upserted,
        skippedNoPhone: result.clientDirectory.skippedNoPhone,
        errored: result.clientDirectory.errored,
        error: result.clientDirectory.errorMessage,
      },
      clients: {
        scanned: result.clients.scanned,
        upserted: result.clients.upserted,
        errored: result.clients.errored,
        error: result.clients.errorMessage,
      },
    },
    { status }
  );
}
