import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "./supabase";

/**
 * Google OAuth helpers for the Calendar integration.
 *
 * Token storage convention (tenant_integrations row, columns from migration 024):
 *   oauth_access_token   - 1-hour Google access token, used as Bearer
 *   oauth_refresh_token  - long-lived; never expires unless user revokes
 *   oauth_expires_at     - timestamptz; computed as now() + expires_in seconds
 *
 * Public surface:
 *   buildAuthUrl(tenantId)           -> URL to redirect the admin to
 *   exchangeCodeForTokens(code)      -> { access_token, refresh_token, expires_in }
 *   ensureFreshAccessToken(tenantId) -> refreshes if within 5 min of expiry,
 *                                       writes back to DB, returns valid access_token
 *   verifyState(stateString)         -> { tenantId } or throws
 *
 * Env vars required:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI
 *   GOOGLE_OAUTH_STATE_SECRET   (random 32+ char string; falls back to SUPABASE_SERVICE_ROLE_KEY
 *                                in dev so the integration works out of the box, but you should
 *                                set a dedicated value in Vercel for production)
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Refresh ~5 min before actual expiry so a request that takes 30 sec doesn't
// straddle the boundary. Google access tokens last 1 hour.
const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

// Both calendar scopes — the read-only scope alone is enough for testConnection
// and getAvailableSlots, but bookAppointment needs full read+write. We request
// the broader one so the consent screen captures permission for everything.
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

function envOrThrow(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

function stateSecret(): string {
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    // Dev-only fallback so the build doesn't crash before secrets are wired.
    // Real production deployments must set GOOGLE_OAUTH_STATE_SECRET.
    "dev-only-google-oauth-state-secret-replace-me"
  );
}

/**
 * Build the URL the admin should be redirected to in order to start OAuth.
 * The `state` param is a signed token carrying the tenantId so the callback
 * knows which tenant_integrations row to write to.
 */
export function buildAuthUrl(tenantId: string): string {
  const state = signState(tenantId);
  const params = new URLSearchParams({
    client_id: envOrThrow("GOOGLE_CLIENT_ID"),
    redirect_uri: envOrThrow("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline -> we get a refresh_token back. Without this, only an access_token
    // is issued and we'd have to re-prompt the user every hour.
    access_type: "offline",
    // consent -> force show the consent screen even on re-auth, so a refresh_token
    // is reliably issued. Google only issues refresh_tokens on the FIRST consent
    // unless prompt=consent is set; this avoids a class of "where's my refresh
    // token" bugs when reconnecting.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string; // absent on refresh, present on initial exchange
  expires_in: number; // seconds
  token_type: "Bearer";
  scope: string;
  id_token?: string;
}

/**
 * Exchange the one-time `code` from the callback for an access_token +
 * refresh_token. Throws on any non-2xx from Google.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: envOrThrow("GOOGLE_CLIENT_ID"),
    client_secret: envOrThrow("GOOGLE_CLIENT_SECRET"),
    redirect_uri: envOrThrow("GOOGLE_REDIRECT_URI"),
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text) as GoogleTokenResponse;
  if (!json.access_token) {
    throw new Error(`Google token response missing access_token: ${text.slice(0, 200)}`);
  }
  return json;
}

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
  // refresh_token is NOT returned on refresh — we keep the original.
}

/**
 * Use the stored refresh_token to obtain a fresh access_token. Called by
 * ensureFreshAccessToken; not normally called directly.
 */
async function refreshAccessToken(refreshToken: string): Promise<RefreshResponse> {
  const body = new URLSearchParams({
    client_id: envOrThrow("GOOGLE_CLIENT_ID"),
    client_secret: envOrThrow("GOOGLE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as RefreshResponse;
}

/**
 * Ensures the tenant has a valid (non-expired-or-soon-to-expire) access_token,
 * refreshing via refresh_token if needed. Writes refreshed values back to the
 * tenant_integrations row so subsequent calls reuse them.
 *
 * Returns the valid access_token. Throws if no integration row exists or no
 * refresh_token is stored (tenant needs to reconnect).
 */
export async function ensureFreshAccessToken(tenantId: string): Promise<string> {
  const { data: row, error } = await supabaseAdmin
    .from("tenant_integrations")
    .select("id, oauth_access_token, oauth_refresh_token, oauth_expires_at")
    .eq("tenant_id", tenantId)
    .eq("platform", "google_calendar")
    .maybeSingle();

  if (error || !row) {
    throw new Error("No Google Calendar integration row for this tenant");
  }
  if (!row.oauth_refresh_token) {
    throw new Error("No refresh_token stored — tenant must reconnect Google Calendar");
  }

  const expiresAt = row.oauth_expires_at ? new Date(row.oauth_expires_at).getTime() : 0;
  const stillValid =
    row.oauth_access_token && expiresAt > Date.now() + REFRESH_LEEWAY_MS;

  if (stillValid) return row.oauth_access_token!;

  // Refresh
  const fresh = await refreshAccessToken(row.oauth_refresh_token);
  const newExpiresAt = new Date(Date.now() + fresh.expires_in * 1000).toISOString();

  const { error: updErr } = await supabaseAdmin
    .from("tenant_integrations")
    .update({
      oauth_access_token: fresh.access_token,
      oauth_expires_at: newExpiresAt,
    })
    .eq("id", row.id);

  if (updErr) {
    // Non-fatal — we got a fresh token, just couldn't persist. Log and continue
    // so the current request succeeds; next call will refresh again.
    console.warn("GOOGLE_OAUTH_TOKEN_PERSIST_WARN:", updErr);
  }

  return fresh.access_token;
}

/**
 * Sign a state token carrying the tenantId. HMAC-SHA256 over `${tenantId}.${timestamp}`
 * with stateSecret(); the timestamp prevents indefinite replay (10 min window).
 *
 * Wire format: `${tenantId}.${timestamp}.${hexSignature}`
 */
function signState(tenantId: string): string {
  const ts = Date.now().toString();
  const payload = `${tenantId}.${ts}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/**
 * Verify a state token from the OAuth callback. Returns the tenantId if valid,
 * throws otherwise. Rejects tokens older than 10 minutes (mid-flow user is
 * unlikely to take longer; replay attempts are rejected).
 */
export function verifyState(state: string): { tenantId: string } {
  const parts = state.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid state token format");
  }
  const [tenantId, ts, sig] = parts;
  const payload = `${tenantId}.${ts}`;
  const expectedSig = createHmac("sha256", stateSecret()).update(payload).digest("hex");

  // Constant-time compare
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid state signature");
  }

  const ageMs = Date.now() - parseInt(ts, 10);
  if (ageMs > 10 * 60 * 1000) {
    throw new Error("State token expired");
  }
  if (!tenantId || tenantId.length < 8) {
    throw new Error("State token tenantId malformed");
  }

  return { tenantId };
}
