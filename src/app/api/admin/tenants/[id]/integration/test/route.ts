import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Smoke-test a tenant's booking platform integration.
 *
 * This is a stub that validates presence of required credentials per
 * platform. The actual per-platform API ping (OAuth handshake, a harmless
 * GET on an availability endpoint, etc.) is wired up as each integration
 * goes live — Boulevard is the priority first target.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const { data: integration } = await supabaseAdmin
    .from("tenant_integrations")
    .select("platform, mode, credentials, config")
    .eq("tenant_id", id)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json(
      { ok: false, error: "No integration configured yet" },
      { status: 400 }
    );
  }

  const creds = (integration.credentials ?? {}) as Record<string, unknown>;
  const config = (integration.config ?? {}) as Record<string, unknown>;

  const missing: string[] = [];
  switch (integration.platform) {
    case "boulevard":
      if (!creds.business_id) missing.push("business_id");
      if (!creds.api_key && !creds.oauth_access_token) missing.push("api_key or OAuth token");
      break;
    case "acuity":
      if (!creds.user_id) missing.push("user_id");
      if (!creds.api_key) missing.push("api_key");
      break;
    case "mindbody":
      if (!creds.site_id) missing.push("site_id");
      if (!creds.api_key) missing.push("api_key");
      if (!creds.source_name) missing.push("source_name");
      break;
    case "square":
      if (!creds.access_token) missing.push("access_token");
      if (!config.location_id) missing.push("config.location_id");
      break;
    case "zenoti":
      if (!creds.api_key) missing.push("api_key");
      if (!config.center_id) missing.push("config.center_id");
      break;
    case "vagaro":
      if (!creds.api_key) missing.push("api_key");
      break;
    case "jane":
    case "glossgenius":
    case "fresha":
    case "self_managed":
      // No API — these always run in sms_fallback mode
      break;
    default:
      return NextResponse.json(
        { ok: false, error: `Unknown platform: ${integration.platform}` },
        { status: 400 }
      );
  }

  const now = new Date().toISOString();

  if (missing.length > 0) {
    const errText = `Missing required fields: ${missing.join(", ")}`;
    await supabaseAdmin
      .from("tenant_integrations")
      .update({ last_test_at: now, last_test_status: "error", last_error: errText })
      .eq("tenant_id", id);
    await supabaseAdmin
      .from("tenants")
      .update({ integration_status: "error", integration_last_error: errText })
      .eq("id", id);
    return NextResponse.json({ ok: false, error: errText }, { status: 400 });
  }

  // Stub: mark as connected. Replace with real per-platform ping later.
  await supabaseAdmin
    .from("tenant_integrations")
    .update({ last_test_at: now, last_test_status: "ok", last_error: null })
    .eq("tenant_id", id);
  await supabaseAdmin
    .from("tenants")
    .update({
      integration_status: "connected",
      integration_connected_at: now,
      integration_last_error: null,
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, platform: integration.platform, mode: integration.mode });
}
