import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildAssistantConfig } from "@/lib/assistant-builder";
import { normalizeBusinessHours } from "@/lib/normalize-hours";
import { seedStaffFromProviders } from "@/lib/staff-seed";
import type { Tenant } from "@/types";

// Twilio requires E.164 (+15551234567). Same helper as demo-provisioner —
// duplicated rather than imported to keep this route self-contained.
function toE164(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

const DEMO_KB_TITLE = "About this preview experience";
const DEMO_KB_CONTENT = [
  "This phone line is a preview experience set up while the spa owner evaluates VauxVoice as their AI Clientele Specialist.",
  "All information you have access to — services, providers, hours, FAQs — was researched from the spa's own website and public sources.",
  "If a caller asks about something not covered in your knowledge base (a specific refund policy, an insurance question, a custom package, a niche treatment), do NOT invent details. Say warmly that you want to make sure you give them accurate information, and offer to have someone from the team follow up.",
  "If a caller directly and explicitly asks whether you're a real person, an AI, or a demo: answer honestly. You're an AI Clientele Specialist. Don't volunteer this otherwise — most callers don't care, and leading with it breaks rapport.",
  "Never claim to be human. Never pretend you can't check the calendar when you can. Never promise things you can't actually do (driving directions live, complex medical advice, prescriptions).",
].join("\n\n");

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

  // Visibility check for the BYO Twilio creds the new provisioning flow
  // needs. If the deploy doesn't see these env vars, the migrate button
  // fails with the unhelpful "credentials not configured" error and the
  // operator has no way to tell whether they're missing, mis-named, or
  // just on a stale deploy. We show only the masked first 6 chars of the
  // SID — never the token — so it's safe to display.
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const sidPreview = sid ? `${sid.slice(0, 6)}… (len ${sid.length})` : "missing";
  const tokenPreview = token ? `set (len ${token.length})` : "missing";
  findings.push({
    ok: Boolean(sid && token),
    label: "Platform Twilio creds visible to runtime",
    detail: `SID=${sidPreview} · TOKEN=${tokenPreview}`,
  });

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
// onto an already-activated tenant. Use this for prospects activated
// before we added each piece to the activation/demo-provisioner. Safe to
// run repeatedly: every step is idempotent or skip-if-already-set.
//
// Backfills:
//   1. Normalized business_hours
//   2. Staff roster (skips existing names)
//   3. Booking-forward to prospect's own phone (so they get the SMS when
//      they call their own demo and "book")
//   4. Demo-mode KB chunk (skips if already present)
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: prospect } = await supabaseAdmin
    .from("crm_prospects")
    .select("id, tenant_id, business_hours, providers, phone")
    .eq("id", id)
    .maybeSingle();
  if (!prospect?.tenant_id) return NextResponse.json({ error: "Not activated" }, { status: 400 });

  // Load current tenant so we know what's already set vs. what we need to
  // fill in. Avoids overwriting a tenant-owned forward phone with the
  // prospect's website-listed number after the spa connects their own.
  const { data: currentTenant } = await supabaseAdmin
    .from("tenants")
    .select("booking_forward_enabled, booking_forward_phones")
    .eq("id", prospect.tenant_id)
    .maybeSingle();

  const tenantUpdates: Record<string, unknown> = {};

  // 1. Normalize + write business_hours.
  const normalized = normalizeBusinessHours(prospect.business_hours);
  if (normalized) tenantUpdates.business_hours = normalized;

  // 3. Booking-forward backfill. Only set if not already configured — the
  //    spa may have customized this after activation and we don't want to
  //    overwrite an intentional choice.
  const forwardPhone = toE164(prospect.phone as string | null | undefined);
  const existingPhones = (currentTenant?.booking_forward_phones as string[] | null) ?? [];
  let forwardConfigured = false;
  if (forwardPhone && existingPhones.length === 0) {
    tenantUpdates.booking_forward_enabled = true;
    tenantUpdates.booking_forward_phones = [forwardPhone];
    forwardConfigured = true;
  }

  let tenantUpdateOk = false;
  if (Object.keys(tenantUpdates).length > 0) {
    tenantUpdates.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("tenants")
      .update(tenantUpdates)
      .eq("id", prospect.tenant_id);
    tenantUpdateOk = !error;
  }

  // 2. Seed staff via shared helper (idempotent by name).
  const staff = await seedStaffFromProviders(prospect.tenant_id, prospect.providers);

  // 4. Demo-mode KB chunk. Insert only if a chunk with that title doesn't
  //    already exist on the tenant — keeps re-runs from piling up duplicates.
  let kbInserted = false;
  const { data: existingKb } = await supabaseAdmin
    .from("knowledge_base_documents")
    .select("id")
    .eq("tenant_id", prospect.tenant_id)
    .eq("title", DEMO_KB_TITLE)
    .limit(1);
  if ((existingKb ?? []).length === 0 && process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const embRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: DEMO_KB_CONTENT,
      });
      const { error } = await supabaseAdmin.from("knowledge_base_documents").insert({
        tenant_id: prospect.tenant_id,
        title: DEMO_KB_TITLE,
        content: DEMO_KB_CONTENT,
        category: "general",
        embedding: embRes.data[0].embedding,
      });
      kbInserted = !error;
    } catch (err) {
      console.error("[diagnose-number backfill] KB embed failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    hours: { written: !!normalized && tenantUpdateOk, normalized },
    staff,
    booking_forward: {
      configured: forwardConfigured,
      phone: forwardPhone,
      already_set: existingPhones.length > 0,
    },
    demo_kb: { inserted: kbInserted, already_present: (existingKb ?? []).length > 0 },
  });
}
