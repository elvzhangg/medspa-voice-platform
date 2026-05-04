import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runFullTenantSync } from "@/lib/appointment-sync";

type Ctx = { params: Promise<{ id: string }> };

// Allowed platform / mode values — keep in sync with migration 024 and UI
const PLATFORMS = [
  "boulevard",
  "acuity",
  "mindbody",
  "square",
  "zenoti",
  "vagaro",
  "jane",
  "wellnessliving",
  "google_calendar",
  "glossgenius",
  "fresha",
  "self_managed",
] as const;
const MODES = ["direct_book", "hybrid", "sms_fallback"] as const;
const STATUSES = ["pending", "connected", "error", "disabled"] as const;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from("tenants")
    .select(
      "id, name, slug, integration_platform, integration_mode, integration_status, integration_connected_at, integration_last_error"
    )
    .eq("id", id)
    .single();
  if (tenantErr || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const { data: integration } = await supabaseAdmin
    .from("tenant_integrations")
    .select(
      "id, platform, mode, credentials, oauth_access_token, oauth_expires_at, config, last_synced_at, last_test_at, last_test_status, last_error, created_at, updated_at"
    )
    .eq("tenant_id", id)
    .maybeSingle();

  return NextResponse.json({ tenant, integration: integration ?? null });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();

  const {
    platform,
    mode,
    status,
    credentials,
    config,
    last_error,
  } = body as {
    platform?: string;
    mode?: string;
    status?: string;
    credentials?: Record<string, unknown>;
    config?: Record<string, unknown>;
    last_error?: string | null;
  };

  if (platform && !PLATFORMS.includes(platform as (typeof PLATFORMS)[number])) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }
  if (mode && !MODES.includes(mode as (typeof MODES)[number])) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Mirror the admin-visible summary onto the tenants row
  const tenantUpdate: Record<string, unknown> = {};
  if (platform !== undefined) tenantUpdate.integration_platform = platform;
  if (mode !== undefined) tenantUpdate.integration_mode = mode;
  if (status !== undefined) {
    tenantUpdate.integration_status = status;
    if (status === "connected") tenantUpdate.integration_connected_at = new Date().toISOString();
  }
  if (last_error !== undefined) tenantUpdate.integration_last_error = last_error;

  if (Object.keys(tenantUpdate).length > 0) {
    const { error: tErr } = await supabaseAdmin
      .from("tenants")
      .update(tenantUpdate)
      .eq("id", id);
    if (tErr) {
      console.error("TENANT_INT_UPDATE_ERR:", tErr);
      return NextResponse.json({ error: "Failed to update tenant" }, { status: 500 });
    }
  }

  // Upsert creds/config row if provided
  if (platform && mode) {
    const upsertPayload: Record<string, unknown> = {
      tenant_id: id,
      platform,
      mode,
      updated_at: new Date().toISOString(),
    };
    if (credentials !== undefined) upsertPayload.credentials = credentials;
    if (config !== undefined) upsertPayload.config = config;

    const { error: iErr } = await supabaseAdmin
      .from("tenant_integrations")
      .upsert(upsertPayload, { onConflict: "tenant_id,platform" });
    if (iErr) {
      console.error("INTEGRATION_UPSERT_ERR:", iErr);
      return NextResponse.json({ error: "Failed to save integration" }, { status: 500 });
    }
  }

  // Fire-and-forget initial sync when the admin flips status to 'connected'.
  // We don't make the admin wait on a roster fetch and a 4-month appointment
  // backfill. Tenants who'd otherwise wait for the 9am cron see staff +
  // the appointment book populated immediately on connect.
  if (status === "connected") {
    void runFullTenantSync(id).catch((err) => {
      console.error("FULL_SYNC_ON_CONNECT_ERR:", id, err);
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  await supabaseAdmin.from("tenant_integrations").delete().eq("tenant_id", id);
  await supabaseAdmin
    .from("tenants")
    .update({
      integration_platform: null,
      integration_mode: null,
      integration_status: "pending",
      integration_connected_at: null,
      integration_last_error: null,
    })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
