import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildAssistantConfig } from "@/lib/assistant-builder";
import { normalizeBusinessHours } from "@/lib/normalize-hours";
import type { Tenant } from "@/types";

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
    .select("id, name, phone_number, vapi_phone_number_id, voice_id, greeting_message, business_hours")
    .eq("id", prospect.tenant_id)
    .maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Tenant row missing" }, { status: 500 });

  const findings: { ok: boolean; label: string; detail?: string }[] = [];
  findings.push({ ok: !!tenant.vapi_phone_number_id, label: "Tenant has vapi_phone_number_id", detail: tenant.vapi_phone_number_id ?? "missing" });
  findings.push({ ok: !!tenant.phone_number && !tenant.phone_number.startsWith("pending:"), label: "Tenant phone_number is real", detail: tenant.phone_number ?? "missing" });
  findings.push({ ok: !!tenant.voice_id, label: "Tenant has voice_id (ElevenLabs)", detail: tenant.voice_id ?? "missing" });
  findings.push({ ok: !!tenant.greeting_message, label: "Tenant has greeting_message", detail: tenant.greeting_message ?? "missing" });

  // How many active staff rows are linked to this tenant? If 0, the AI can
  // never introduce providers — the backfill button surfaces this.
  const { count: staffCount } = await supabaseAdmin
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("active", true);
  const { data: staffNames } = await supabaseAdmin
    .from("staff")
    .select("name")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .limit(5);
  const namePreview = (staffNames ?? []).map((r) => r.name).join(", ") || "(none)";
  findings.push({
    ok: (staffCount ?? 0) > 0,
    label: "Tenant has staff seeded",
    detail: `${staffCount ?? 0} active — ${namePreview}`,
  });

  // Are tenant.business_hours in the strict {open,close} shape the assistant
  // builder requires? If a day's value is a string like "9-6", the prompt
  // will render it as CLOSED.
  const hours = tenant.business_hours as Record<string, unknown> | null | undefined;
  let hoursOk = false;
  let hoursDetail = "missing";
  if (hours && typeof hours === "object") {
    const days = Object.entries(hours);
    const validDays = days.filter(([, v]) => {
      if (!v || typeof v !== "object") return false;
      const o = v as Record<string, unknown>;
      return typeof o.open === "string" && typeof o.close === "string";
    });
    hoursOk = validDays.length > 0;
    hoursDetail = `${validDays.length}/${days.length} days in valid {open,close} format`;
  }
  findings.push({ ok: hoursOk, label: "Tenant business_hours are parseable", detail: hoursDetail });

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

    // Ping the actual URL — this is the check that catches "URL is configured
    // but the domain doesn't actually serve the app" (e.g. unconfigured custom
    // domain). Our route only allows POST so a GET should respond 405; any
    // network-level failure (DNS, timeout, parking page) means the webhook
    // wouldn't reach us during a real call.
    if (serverUrl) {
      let reachable = false;
      let pingDetail = "";
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const pingRes = await fetch(serverUrl, { method: "GET", signal: ctrl.signal });
        clearTimeout(timer);
        // 405 (method not allowed) = route exists, just rejecting GET. That's healthy.
        // 200 with our app's HTML = wrong route or domain serving something else.
        // Anything else (404, 5xx, etc.) = the URL is broken.
        if (pingRes.status === 405) {
          reachable = true;
          pingDetail = "✓ 405 (route exists, rejected GET — expected)";
        } else {
          pingDetail = `${pingRes.status} ${pingRes.statusText} — expected 405. Domain may not point at the app.`;
        }
      } catch (e) {
        pingDetail = `unreachable: ${(e as Error).message}`;
      }
      findings.push({ ok: reachable, label: "Webhook URL actually responds", detail: pingDetail });
    }

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

  // Actually call buildAssistantConfig — this is what our webhook would
  // return to Vapi on assistant-request. If it throws or returns something
  // missing required fields, that's why Vapi says "no assistant".
  let assistantPreview: Record<string, unknown> | null = null;
  let assistantBuildError: string | null = null;
  try {
    const fullTenant = await supabaseAdmin.from("tenants").select("*").eq("id", tenant.id).single();
    if (fullTenant.data) {
      const cfg = await buildAssistantConfig(fullTenant.data as Tenant);
      assistantPreview = cfg as unknown as Record<string, unknown>;
      const hasName = !!cfg.name;
      const hasModel = !!cfg.model;
      const hasVoice = !!cfg.voice;
      const hasFirstMessage = !!cfg.firstMessage;
      findings.push({
        ok: hasName && hasModel && hasVoice && hasFirstMessage,
        label: "buildAssistantConfig returns a usable assistant",
        detail: [
          hasName ? "name ✓" : "name ✗",
          hasModel ? "model ✓" : "model ✗",
          hasVoice ? "voice ✓" : "voice ✗",
          hasFirstMessage ? "firstMessage ✓" : "firstMessage ✗",
        ].join(" · "),
      });
    } else {
      findings.push({ ok: false, label: "buildAssistantConfig — tenant fetch", detail: "no tenant row" });
    }
  } catch (e) {
    assistantBuildError = (e as Error).message;
    findings.push({
      ok: false,
      label: "buildAssistantConfig threw",
      detail: assistantBuildError,
    });
  }

  const allOk = findings.every((f) => f.ok);
  return NextResponse.json({
    tenant,
    expected_webhook: EXPECTED_WEBHOOK,
    vapi_number: vapiNumber,
    vapi_error: vapiError,
    assistant_preview: assistantPreview,
    assistant_build_error: assistantBuildError,
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

// POST /api/admin/crm/[id]/diagnose-number — backfill assistant data
// (normalized hours + staff roster) onto an already-activated tenant. Use
// this for prospects activated before we added these steps to the activation
// commit. Safe to run repeatedly: hours overwrite, staff are skipped if a
// row with the same name already exists for the tenant.
interface BackfillProvider { name?: string; title?: string; specialties?: string[]; bio?: string }

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: prospect } = await supabaseAdmin
    .from("crm_prospects")
    .select("id, tenant_id, business_hours, providers")
    .eq("id", id)
    .maybeSingle();
  if (!prospect?.tenant_id) return NextResponse.json({ error: "Not activated" }, { status: 400 });

  // 1. Normalize + write business_hours.
  const normalized = normalizeBusinessHours(prospect.business_hours);
  let hoursWritten = false;
  if (normalized) {
    const { error } = await supabaseAdmin
      .from("tenants")
      .update({ business_hours: normalized, updated_at: new Date().toISOString() })
      .eq("id", prospect.tenant_id);
    hoursWritten = !error;
  }

  // 2. Seed staff. Skip names that already exist for this tenant so re-runs
  //    don't duplicate.
  const { data: existingStaff } = await supabaseAdmin
    .from("staff")
    .select("name")
    .eq("tenant_id", prospect.tenant_id);
  const have = new Set((existingStaff ?? []).map((r) => String(r.name).toLowerCase()));

  let staffInserted = 0;
  let staffSkipped = 0;
  if (Array.isArray(prospect.providers)) {
    for (const raw of prospect.providers as BackfillProvider[]) {
      const name = raw?.name?.trim();
      if (!name || have.has(name.toLowerCase())) { staffSkipped += 1; continue; }
      const row: Record<string, unknown> = {
        tenant_id: prospect.tenant_id,
        name,
        title: raw.title?.trim() || null,
        specialties: Array.isArray(raw.specialties) ? raw.specialties.filter(Boolean) : [],
        bio: raw.bio?.trim() || null,
        active: true,
      };
      const { error } = await supabaseAdmin.from("staff").insert(row);
      if (error) {
        const { error: e2 } = await supabaseAdmin.from("staff").insert({
          tenant_id: prospect.tenant_id, name, title: row.title,
        });
        if (e2) { staffSkipped += 1; continue; }
      }
      staffInserted += 1;
      have.add(name.toLowerCase());
    }
  }

  return NextResponse.json({
    ok: true,
    hours: { written: hoursWritten, normalized },
    staff: { inserted: staffInserted, skipped: staffSkipped },
  });
}
