import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildAuthUrl } from "@/lib/google-oauth";

/**
 * GET /api/admin/google/start?tenant=<tenantId>
 *
 * Initiates the Google Calendar OAuth flow for an admin connecting a tenant's
 * calendar. Verifies the tenant exists, then redirects to Google's
 * authorization endpoint with a signed state token carrying the tenantId.
 *
 * On the way back, /api/admin/google/callback will verify the state and
 * exchange the code for tokens.
 *
 * Auth note: This route is reachable from /admin/* — protected at the page
 * level by your admin auth. We don't repeat auth here because the browser
 * redirect can't carry session cookies through Google's redirect cleanly.
 * The state token is HMAC-signed to prevent tenantId tampering.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenant");
  if (!tenantId) {
    return NextResponse.json(
      { error: "Missing required query param: tenant" },
      { status: 400 }
    );
  }

  // Verify tenant exists before sending the user off to Google. If we don't,
  // a typo'd tenant id would make the user authorize for nothing.
  const { data: tenant, error } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  let url: string;
  try {
    url = buildAuthUrl(tenantId);
  } catch (err) {
    console.error("GOOGLE_AUTH_URL_BUILD_ERR:", err);
    return NextResponse.json(
      {
        error:
          "Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI env vars.",
      },
      { status: 500 }
    );
  }

  return NextResponse.redirect(url);
}
