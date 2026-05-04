import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/integrations/status
 *
 * Tenant-side read of the current integration status. Returns just the
 * fields the /dashboard/integrations page needs — platform, status, when
 * connected, last error. Doesn't expose tokens or credential JSON.
 *
 * (The richer admin GET at /api/admin/tenants/{id}/integration returns
 * everything; this endpoint is intentionally minimal so a tenant user
 * never sees integration plumbing.)
 */
export async function GET() {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = (tenant as unknown as { id: string }).id;

  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select(
      "integration_platform, integration_status, integration_connected_at, integration_last_error"
    )
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({
      platform: null,
      status: null,
      connectedAt: null,
      lastError: null,
    });
  }

  return NextResponse.json({
    platform: data.integration_platform,
    status: data.integration_status,
    connectedAt: data.integration_connected_at,
    lastError: data.integration_last_error,
  });
}
