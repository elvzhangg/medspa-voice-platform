import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const EXPECTED_WEBHOOK =
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://medspa-voice-platform.vercel.app") +
  "/api/vapi/webhook";

// GET /api/admin/crm/[id]/diagnose-number
// Fetches the Vapi phone-number config for the prospect's tenant and reports
// whether the webhook is wired correctly. Use this when a test call fails to
// reach the agent — the most common cause is a wrong/missing serverUrl on the
// number, or an assistantId override that bypasses our dynamic webhook.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { data: prospect } = await supabaseAdmin
    .from("crm_prospects")
    .select("id, business_name, tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  if (!prospect.tenant_id) {
    return NextResponse.json({ error: "Prospect not activated yet" }, { status: 400 });
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, name, phone_number, vapi_phone_number_id, voice_id, greeting_message")
    .eq("id", prospect.tenant_id)
    .maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Tenant row missing" }, { status: 500 });

  const findings: { ok: boolean; label: string; detail?: string }[] = [];
  findings.push({ ok: !!tenant.vapi_phone_number_id, label: "Tenant has vapi_phone_number_id", detail: tenant.vapi_phone_number_id ?? "missing" });
  findings.push({ ok: !!tenant.phone_number && !tenant.phone_number.startsWith("pending:"), label: "Tenant phone_number is real", detail: tenant.phone_number ?? "missing" });
  findings.push({ ok: !!tenant.voice_id, label: "Tenant has voice_id (ElevenLabs)", detail: tenant.voice_id ?? "missing" });
  findings.push({ ok: !!tenant.greeting_message, label: "Tenant has greeting_message", detail: tenant.greeting_message ?? "missing" });

  let vapiNumber: Record<string, unknown> | null = null;
  let vapiError: string | null = null;
  if (tenant.vapi_phone_number_id) {
    const res = await fetch(`https://api.vapi.ai/phone-number/${tenant.vapi_phone_number_id}`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    });
    if (res.ok) {
      vapiNumber = await res.json();
    } else {
      vapiError = `${res.status} ${(await res.text()).slice(0, 300)}`;
    }
  }

  if (vapiNumber) {
    // Vapi historically supports both top-level serverUrl and nested server.url.
    // Newer accounts may default to the nested form.
    const topLevelServerUrl = vapiNumber.serverUrl as string | undefined;
    const nestedServerUrl = (vapiNumber.server as { url?: string } | undefined)?.url;
    const serverUrl = topLevelServerUrl ?? nestedServerUrl;
    const assistantId = vapiNumber.assistantId as string | undefined;

    findings.push({
      ok: !!serverUrl,
      label: "Vapi number has serverUrl set",
      detail: serverUrl ?? "(none — webhook will never be called → no agent)",
    });
    findings.push({
      ok: !!serverUrl && serverUrl === EXPECTED_WEBHOOK,
      label: "serverUrl points to our webhook",
      detail: serverUrl
        ? serverUrl === EXPECTED_WEBHOOK
          ? "✓ matches"
          : `mismatch — got "${serverUrl}", expected "${EXPECTED_WEBHOOK}"`
        : "n/a",
    });
    findings.push({
      ok: !assistantId,
      label: "No assistantId override on the number",
      detail: assistantId
        ? `set to ${assistantId} — this OVERRIDES the dynamic webhook flow; remove it or set serverUrl on the assistant instead`
        : "✓ none (webhook will be called per call)",
    });
  } else {
    findings.push({ ok: false, label: "Fetch Vapi number config", detail: vapiError ?? "no vapi_phone_number_id" });
  }

  const allOk = findings.every((f) => f.ok);
  return NextResponse.json({
    tenant,
    expected_webhook: EXPECTED_WEBHOOK,
    vapi_number: vapiNumber,
    vapi_error: vapiError,
    findings,
    healthy: allOk,
  });
}

// PATCH /api/admin/crm/[id]/diagnose-number
// One-click fix: re-PATCH the Vapi number to set serverUrl to the expected
// webhook URL, and clear any assistantId that would override it.
export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: prospect } = await supabaseAdmin
    .from("crm_prospects")
    .select("tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (!prospect?.tenant_id) return NextResponse.json({ error: "Not activated" }, { status: 400 });

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("vapi_phone_number_id")
    .eq("id", prospect.tenant_id)
    .maybeSingle();
  if (!tenant?.vapi_phone_number_id) return NextResponse.json({ error: "No Vapi number id on tenant" }, { status: 400 });

  // Send both serverUrl shapes to be defensive — Vapi has changed the schema
  // before. assistantId: null clears any static-assistant override that would
  // bypass the dynamic webhook.
  const res = await fetch(`https://api.vapi.ai/phone-number/${tenant.vapi_phone_number_id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      serverUrl: EXPECTED_WEBHOOK,
      server: { url: EXPECTED_WEBHOOK },
      assistantId: null,
    }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Vapi patch failed: ${res.status} ${await res.text()}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, patched_to: EXPECTED_WEBHOOK });
}
