import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { buildAuthUrl } from "@/lib/google-oauth";

/**
 * GET /api/google/start
 *
 * Tenant-side counterpart of /api/admin/google/start. Resolves the current
 * tenant from session (via getCurrentTenant) — there's no tenantId query
 * param, so a logged-in tenant can't accidentally start OAuth for another
 * tenant. Returns 401 if not signed in.
 *
 * Builds the auth URL with context="tenant" so the callback redirects back
 * to /{slug}/dashboard/integrations rather than /admin/tenants/{id}/integration.
 *
 * Reuses the same Google Cloud OAuth client + same redirect URI as the admin
 * flow (the admin callback handles both contexts). No additional Google Cloud
 * config needed.
 */
export async function GET() {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = (tenant as unknown as { id: string }).id;

  let url: string;
  try {
    url = buildAuthUrl(tenantId, "tenant");
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
