import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureFreshAccessToken } from "@/lib/google-oauth";
import googleCalendarAdapter from "@/lib/integrations/google-calendar";

/**
 * POST /api/integrations/verify
 *
 * Tenant-side connection verifier. Used to recover from "stuck pending" —
 * cases where OAuth completed but integration_status didn't flip to
 * 'connected' (e.g., the OAuth callback predates the auto-test fix, or the
 * test endpoint was unreachable at the time).
 *
 * What it does:
 *   1. Confirms the tenant is authenticated (via getCurrentTenant)
 *   2. Loads the Google Calendar integration row (rejects if not GCal)
 *   3. Refreshes the OAuth access token if needed
 *   4. Runs the GCal adapter's testConnection
 *   5. Updates tenants.integration_status accordingly
 *
 * Idempotent — safe to call repeatedly. The /dashboard/integrations page
 * calls this automatically on mount when status='pending', so the tenant
 * never sees stuck state.
 */
export async function POST() {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (tenant as unknown as { id: string }).id;

  // Confirm this is a Google Calendar integration. Other platforms have their
  // own test paths (admin Test button) and don't go through this endpoint.
  const { data: tenantRow } = await supabaseAdmin
    .from("tenants")
    .select("integration_platform")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantRow?.integration_platform !== "google_calendar") {
    return NextResponse.json(
      { error: "Not a Google Calendar integration", platform: tenantRow?.integration_platform },
      { status: 400 }
    );
  }

  // Refresh token if needed and get a valid access_token. Fails if the tenant
  // has no integration row or no refresh_token (i.e., they never completed
  // OAuth) — in which case there's nothing to verify yet.
  let accessToken: string;
  try {
    accessToken = await ensureFreshAccessToken(tenantId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: "Could not refresh OAuth token. Please reconnect your Google account.",
        detail,
      },
      { status: 400 }
    );
  }

  // Run the adapter's test
  let testOk = false;
  let businessName: string | null = null;
  let lastError: string | null = null;
  try {
    const result = await googleCalendarAdapter.testConnection({
      credentials: { access_token: accessToken },
      config: {},
    });
    if (result.ok) {
      testOk = true;
      businessName = result.businessName ?? null;
    } else {
      lastError = result.detail ?? "Connection test failed";
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  // Persist test outcome on tenant_integrations + flip tenants.integration_status
  await supabaseAdmin
    .from("tenant_integrations")
    .update({
      last_test_at: new Date().toISOString(),
      last_test_status: testOk ? "ok" : "error",
      last_error: lastError,
    })
    .eq("tenant_id", tenantId)
    .eq("platform", "google_calendar");

  await supabaseAdmin
    .from("tenants")
    .update({
      integration_status: testOk ? "connected" : "error",
      integration_connected_at: testOk ? new Date().toISOString() : null,
      integration_last_error: lastError,
    })
    .eq("id", tenantId);

  return NextResponse.json({
    ok: testOk,
    businessName,
    error: lastError,
  });
}
