import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { runFullTenantSync } from "@/lib/appointment-sync";

/**
 * Tenant-safe view of their booking integration state.
 * Deliberately does NOT expose credentials/config — those are admin-only.
 *
 * Side effect: when a tenant is in connected-but-never-synced state
 * (status=connected AND last_synced_at IS NULL), this endpoint kicks off
 * a fire-and-forget initial sync. That covers any way a tenant ends up
 * connected without going through the admin API trigger — direct SQL
 * inserts, dev seeds, manual fixups, failed-then-revived integrations.
 * Idempotent: runFullTenantSync always bumps last_synced_at (even on
 * error) so this branch only fires once.
 */
export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // last_synced_at on the dashboard is the freshness signal — show whichever
  // is more recent: a webhook arrival, or a manual/scheduled sync run.
  // Webhooks fire per-event (every appointment change); sync runs are
  // bulk reconciliation. Both indicate "we touched the platform recently."
  let lastSyncedAt: string | null = null;
  let needsBootstrap = false;
  if (tenant.integration_platform) {
    const { data } = await supabaseAdmin
      .from("tenant_integrations")
      .select("webhook_last_received_at, last_synced_at")
      .eq("tenant_id", tenant.id)
      .eq("platform", tenant.integration_platform)
      .maybeSingle();
    const webhookAt = data?.webhook_last_received_at ?? null;
    const syncAt = data?.last_synced_at ?? null;
    if (webhookAt && syncAt) {
      lastSyncedAt = new Date(webhookAt) > new Date(syncAt) ? webhookAt : syncAt;
    } else {
      lastSyncedAt = webhookAt ?? syncAt;
    }
    needsBootstrap =
      tenant.integration_status === "connected" && syncAt === null;
  }

  if (needsBootstrap) {
    void runFullTenantSync(tenant.id).catch((err) => {
      console.error("INTEGRATION_BOOTSTRAP_SYNC_ERR:", tenant.id, err);
    });
  }

  return NextResponse.json({
    platform: tenant.integration_platform ?? null,
    mode: tenant.integration_mode ?? null,
    status: tenant.integration_status ?? "pending",
    connected_at: tenant.integration_connected_at ?? null,
    last_synced_at: lastSyncedAt,
    last_error: tenant.integration_last_error ?? null,
  });
}
