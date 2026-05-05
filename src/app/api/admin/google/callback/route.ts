import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  exchangeCodeForTokens,
  verifyState,
  type OAuthContext,
} from "@/lib/google-oauth";
import googleCalendarAdapter from "@/lib/integrations/google-calendar";

/**
 * GET /api/admin/google/callback?code=<code>&state=<signedState>
 *
 * Google's OAuth redirect lands here after the admin authorizes Calendar
 * access. We:
 *   1. Verify the state token (HMAC-signed, carries tenantId)
 *   2. Exchange the code for access + refresh tokens
 *   3. Upsert tenant_integrations with the tokens (in dedicated oauth_*
 *      columns, NOT in credentials JSON — credentials is for static API
 *      keys; OAuth tokens have their own columns from migration 024)
 *   4. Set the tenant's integration_platform = 'google_calendar' and
 *      mode = 'direct_book', status = 'pending' (admin still has to pick
 *      which calendars map to which providers, then Test connection)
 *   5. Redirect back to the admin integration page
 *
 * On error, we redirect back with an `?gcal_error=` query param the page
 * can surface to the admin.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  // User clicked "Cancel" or Google returned an error — bounce back without
  // touching the DB. We don't yet know context, so default to admin URL.
  if (error) {
    const back = await backUrl(req, null, "admin", `Google authorization cancelled: ${error}`);
    return NextResponse.redirect(back);
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state from Google callback" },
      { status: 400 }
    );
  }

  // Verify state -> tenantId + context (which dashboard initiated this flow)
  let tenantId: string;
  let context: OAuthContext;
  try {
    ({ tenantId, context } = verifyState(state));
  } catch (err) {
    console.error("GOOGLE_OAUTH_STATE_VERIFY_ERR:", err);
    return NextResponse.json(
      { error: "Invalid state token — possible tampering or expired session" },
      { status: 400 }
    );
  }

  // Exchange the code for tokens
  let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>>;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    console.error("GOOGLE_OAUTH_EXCHANGE_ERR:", err);
    const back = await backUrl(
      req,
      tenantId,
      context,
      `Failed to exchange code for tokens: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return NextResponse.redirect(back);
  }

  if (!tokens.refresh_token) {
    // refresh_token absent — usually means the user has previously authorized
    // this app on the same Google account and Google didn't re-issue one. We
    // requested prompt=consent to avoid this, but log loudly if it slips.
    console.warn(
      "GOOGLE_OAUTH_NO_REFRESH_TOKEN: tenant=" + tenantId + " — admin may need to revoke + reconnect"
    );
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Upsert tenant_integrations row
  const { error: upsertErr } = await supabaseAdmin
    .from("tenant_integrations")
    .upsert(
      {
        tenant_id: tenantId,
        platform: "google_calendar",
        mode: "direct_book",
        // credentials stays empty — the access_token is injected at request
        // time by loadTenantIntegration via the oauth_* columns below.
        credentials: {},
        oauth_access_token: tokens.access_token,
        // Don't blow away an existing refresh_token if Google didn't issue
        // a new one (re-consent on already-authorized account).
        ...(tokens.refresh_token ? { oauth_refresh_token: tokens.refresh_token } : {}),
        oauth_expires_at: expiresAt,
        last_test_status: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,platform" }
    );

  if (upsertErr) {
    console.error("GOOGLE_OAUTH_UPSERT_ERR:", upsertErr);
    const back = await backUrl(
      req,
      tenantId,
      context,
      "Connected to Google, but failed to save tokens. Please try again."
    );
    return NextResponse.redirect(back);
  }

  // Auto-test the connection: call the GCal adapter's testConnection with the
  // freshly-exchanged access_token. If it succeeds, mark the tenant 'connected'
  // immediately so the dashboard reflects working state. If it fails, mark
  // 'error' with the failure reason — better UX than the previous "pending"
  // limbo where the tenant had no clear next step.
  let nextStatus: "connected" | "error" = "connected";
  let lastError: string | null = null;
  let connectedAt: string | null = new Date().toISOString();

  try {
    const testResult = await googleCalendarAdapter.testConnection({
      credentials: { access_token: tokens.access_token },
      config: {},
    });
    if (!testResult.ok) {
      nextStatus = "error";
      lastError = testResult.detail || "Connection test failed";
      connectedAt = null;
      console.warn(
        "GOOGLE_OAUTH_TEST_FAILED tenant=" + tenantId + ":",
        testResult.detail
      );
    }
  } catch (err) {
    nextStatus = "error";
    lastError = err instanceof Error ? err.message : String(err);
    connectedAt = null;
    console.error("GOOGLE_OAUTH_TEST_EXCEPTION:", err);
  }

  // Persist the test result on the tenant_integrations row too — useful for
  // diagnostics later if the admin wants to see "last test passed/failed."
  await supabaseAdmin
    .from("tenant_integrations")
    .update({
      last_test_at: new Date().toISOString(),
      last_test_status: nextStatus === "connected" ? "ok" : "error",
      last_error: lastError,
    })
    .eq("tenant_id", tenantId)
    .eq("platform", "google_calendar");

  // Mirror final state onto the tenants row.
  const { error: tenantErr } = await supabaseAdmin
    .from("tenants")
    .update({
      integration_platform: "google_calendar",
      integration_mode: "direct_book",
      integration_status: nextStatus,
      integration_connected_at: connectedAt,
      integration_last_error: lastError,
    })
    .eq("id", tenantId);

  if (tenantErr) {
    console.error("GOOGLE_OAUTH_TENANT_UPDATE_ERR:", tenantErr);
    // Tokens are saved; tenant row update failed. Soft warning, don't crash.
    const back = await backUrl(
      req,
      tenantId,
      context,
      "Tokens saved, but tenant record didn't update. Refresh the page."
    );
    return NextResponse.redirect(back);
  }

  // Success — back to the right dashboard page. If the connection test failed,
  // surface the reason; otherwise show the green success flag.
  const back = await backUrl(
    req,
    tenantId,
    context,
    nextStatus === "error"
      ? `Authorization succeeded but the connection test failed: ${lastError}`
      : null
  );
  if (nextStatus === "connected") back.searchParams.set("gcal_connected", "1");
  return NextResponse.redirect(back);
}

/**
 * Construct the URL we redirect back to. Branches on context:
 *   admin  -> /admin/tenants/{id}/integration
 *   tenant -> /{slug}/dashboard/integrations  (slug looked up from tenants row)
 *
 * If tenantId is null (rare error path), fall back to /admin/tenants for admin
 * and /auth/login for tenant.
 *
 * Optional error message rides as ?gcal_error=.
 */
async function backUrl(
  req: NextRequest,
  tenantId: string | null,
  context: OAuthContext,
  errorMessage: string | null
): Promise<URL> {
  const base = req.nextUrl.origin;

  let path: string;
  if (context === "tenant" && tenantId) {
    // Need the slug for the tenant-side URL pattern /{slug}/dashboard/integrations
    const { data } = await supabaseAdmin
      .from("tenants")
      .select("slug")
      .eq("id", tenantId)
      .maybeSingle();
    const slug = data?.slug;
    path = slug ? `/${slug}/dashboard/integrations` : "/auth/login";
  } else if (tenantId) {
    path = `/admin/tenants/${tenantId}/integration`;
  } else {
    path = context === "tenant" ? "/auth/login" : "/admin/tenants";
  }

  const url = new URL(path, base);
  if (errorMessage) url.searchParams.set("gcal_error", errorMessage);
  return url;
}
