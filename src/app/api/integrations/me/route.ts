import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";

/**
 * Tenant-safe view of their booking integration state.
 * Deliberately does NOT expose credentials/config — those are admin-only.
 */
export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    platform: tenant.integration_platform ?? null,
    mode: tenant.integration_mode ?? null,
    status: tenant.integration_status ?? "pending",
    connected_at: tenant.integration_connected_at ?? null,
    last_error: tenant.integration_last_error ?? null,
  });
}
