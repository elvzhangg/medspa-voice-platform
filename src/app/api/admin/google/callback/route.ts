import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { exchangeCodeForTokens, verifyState } from "@/lib/google-oauth";

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
  // touching the DB so the admin sees the existing state intact.
  if (error) {
    const back = adminBackUrl(req, null, `Google authorization cancelled: ${error}`);
    return NextResponse.redirect(back);
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state from Google callback" },
      { status: 400 }
    );
  }

  // Verify state -> tenantId
  let tenantId: string;
  try {
    ({ tenantId } = verifyState(state));
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
    const back = adminBackUrl(
      req,
      tenantId,
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
    const back = adminBackUrl(
      req,
      tenantId,
      "Connected to Google, but failed to save tokens. Please try again."
    );
    return NextResponse.redirect(back);
  }

  // Mirror onto tenants row so the admin status pill flips immediately.
  // Status stays "pending" until the admin picks calendars and runs Test.
  const { error: tenantErr } = await supabaseAdmin
    .from("tenants")
    .update({
      integration_platform: "google_calendar",
      integration_mode: "direct_book",
      integration_status: "pending",
      integration_last_error: null,
    })
    .eq("id", tenantId);

  if (tenantErr) {
    console.error("GOOGLE_OAUTH_TENANT_UPDATE_ERR:", tenantErr);
    // Tokens are saved; tenant row update failed. Not fatal — admin can
    // still proceed via the form. Surface a soft warning.
    const back = adminBackUrl(
      req,
      tenantId,
      "Tokens saved, but tenant record didn't update. Refresh the page."
    );
    return NextResponse.redirect(back);
  }

  // Success — back to the integration page with a success flag the page
  // can read on next render.
  const back = adminBackUrl(req, tenantId, null);
  back.searchParams.set("gcal_connected", "1");
  return NextResponse.redirect(back);
}

/**
 * Construct the admin integration page URL we redirect back to. If we have
 * a tenantId, go straight to that tenant's integration page; otherwise fall
 * back to the tenants list. Optional error message rides as ?gcal_error=.
 */
function adminBackUrl(
  req: NextRequest,
  tenantId: string | null,
  errorMessage: string | null
): URL {
  const base = req.nextUrl.origin;
  const url = new URL(
    tenantId ? `/admin/tenants/${tenantId}/integration` : "/admin/tenants",
    base
  );
  if (errorMessage) url.searchParams.set("gcal_error", errorMessage);
  return url;
}
