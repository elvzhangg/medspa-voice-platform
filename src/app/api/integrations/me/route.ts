import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Tenant-safe view of their booking integration state.
 * Deliberately does NOT expose credentials/config — those are admin-only.
 */
export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let lastSyncedAt: string | null = null;
  if (tenant.integration_platform) {
    const { data } = await supabaseAdmin
      .from("tenant_integrations")
      .select("webhook_last_received_at")
      .eq("tenant_id", tenant.id)
      .eq("platform", tenant.integration_platform)
      .maybeSingle();
    lastSyncedAt = data?.webhook_last_received_at ?? null;
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
