import { supabaseAdmin } from "./supabase";
import { logProspectEvent } from "./prospect-events";
import { normalizeBusinessHours } from "./normalize-hours";
import { seedStaffFromProviders } from "./staff-seed";

const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const WEBHOOK_URL =
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://medspa-voice-platform.vercel.app") +
  "/api/vapi/webhook";

interface Procedure { name: string; description?: string; duration_min?: number; price?: string | number; notes?: string }
interface Special { name: string; description?: string; discount?: string; valid_through?: string; eligibility?: string }
interface Provider { name: string; title?: string; specialties?: string[]; bio?: string }
interface HoursValue { open?: string; close?: string }

export interface ProvisionResult {
  ok: boolean;
  already_provisioned?: boolean;
  tenant_id?: string;
  phone_number?: string;
  kb_chunks?: number;
  error?: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function areaCodeFrom(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const stripped = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  return stripped.length >= 3 ? stripped.slice(0, 3) : null;
}

// Twilio requires E.164 (+15551234567). Accept any common US display form
// and emit the canonical form; return null if we can't confidently produce
// a 10-digit US number.
function toE164(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function buildKnowledgeChunks(p: Record<string, unknown>): Array<{ title: string; content: string; category: "services" | "pricing" | "policies" | "faq" | "general" }> {
  const chunks: Array<{ title: string; content: string; category: "services" | "pricing" | "policies" | "faq" | "general" }> = [];

  const overviewParts: string[] = [];
  overviewParts.push(`Business name: ${p.business_name}`);
  if (p.address) overviewParts.push(`Address: ${p.address}`);
  if (p.city || p.state) overviewParts.push(`Location: ${[p.city, p.state].filter(Boolean).join(", ")}`);
  if (p.phone) overviewParts.push(`Main phone: ${p.phone}`);
  if (p.website) overviewParts.push(`Website: ${p.website}`);
  if (p.services_summary) overviewParts.push(`Overview: ${p.services_summary}`);
  if (overviewParts.length > 1) {
    chunks.push({ title: "Business overview", content: overviewParts.join("\n"), category: "general" });
  }

  if (p.business_hours && typeof p.business_hours === "object") {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const lines: string[] = [];
    for (const day of days) {
      const val = (p.business_hours as Record<string, HoursValue | string>)[day];
      if (val == null) continue;
      const display = typeof val === "string" ? val : val.open && val.close ? `${val.open}–${val.close}` : "";
      if (display) lines.push(`${day.charAt(0).toUpperCase() + day.slice(1)}: ${display}`);
    }
    if (lines.length) {
      chunks.push({ title: "Hours of operation", content: lines.join("\n"), category: "policies" });
    }
  }

  // Parking / directions
  if (p.directions_parking_info && String(p.directions_parking_info).trim()) {
    chunks.push({
      title: "Parking and directions",
      content: String(p.directions_parking_info),
      category: "policies",
    });
  }

  // Booking policies & payment info
  if (p.booking_config && typeof p.booking_config === "object") {
    const bc = p.booking_config as Record<string, unknown>;
    if (bc.cancellation_policy) {
      chunks.push({ title: "Cancellation policy", content: String(bc.cancellation_policy), category: "policies" });
    }
    if (bc.deposit_policy || bc.deposit_amount_display) {
      const lines: string[] = [];
      if (bc.deposit_policy) lines.push(String(bc.deposit_policy));
      if (bc.deposit_amount_display) lines.push(`Amount: ${bc.deposit_amount_display}`);
      chunks.push({ title: "Deposit policy", content: lines.join("\n"), category: "policies" });
    }
    if (bc.late_policy) {
      chunks.push({ title: "Late arrival policy", content: String(bc.late_policy), category: "policies" });
    }
    if (Array.isArray(bc.payment_methods) && bc.payment_methods.length) {
      chunks.push({
        title: "Payment methods accepted",
        content: `We accept: ${(bc.payment_methods as string[]).join(", ")}`,
        category: "faq",
      });
    }
    if (Array.isArray(bc.financing_options) && bc.financing_options.length) {
      chunks.push({
        title: "Financing options",
        content: `We offer financing through: ${(bc.financing_options as string[]).join(", ")}`,
        category: "pricing",
      });
    }
    if (bc.membership_program) {
      chunks.push({ title: "Membership program", content: String(bc.membership_program), category: "pricing" });
    }
  }

  // FAQs — one chunk per Q/A so the RAG search hits the specific question
  if (Array.isArray(p.faqs)) {
    for (const faq of p.faqs as Array<{ question?: string; answer?: string }>) {
      if (!faq?.question || !faq?.answer) continue;
      chunks.push({
        title: `FAQ — ${faq.question.slice(0, 60)}`,
        content: `Q: ${faq.question}\nA: ${faq.answer}`,
        category: "faq",
      });
    }
  }

  if (Array.isArray(p.procedures)) {
    for (const proc of p.procedures as Procedure[]) {
      if (!proc?.name) continue;
      const lines: string[] = [`Service: ${proc.name}`];
      if (proc.description) lines.push(proc.description);
      if (proc.duration_min != null) lines.push(`Typical duration: ${proc.duration_min} minutes`);
      if (proc.price != null && String(proc.price).trim() !== "") lines.push(`Price: ${proc.price}`);
      if (proc.notes) lines.push(`Notes: ${proc.notes}`);
      chunks.push({
        title: `Procedure — ${proc.name}`,
        content: lines.join("\n"),
        category: proc.price != null ? "pricing" : "services",
      });
    }
  }

  // Current specials/promotions — one chunk per offer so the RAG search
  // matches when a caller asks about deals, discounts, packages, or
  // membership perks. Vivienne can quote the discount and eligibility
  // verbatim from the spa's own marketing.
  if (Array.isArray(p.specials)) {
    for (const s of p.specials as Special[]) {
      if (!s?.name) continue;
      const lines: string[] = [`Current special: ${s.name}`];
      if (s.discount) lines.push(`Offer: ${s.discount}`);
      if (s.description) lines.push(s.description);
      if (s.eligibility) lines.push(`Who qualifies: ${s.eligibility}`);
      if (s.valid_through) lines.push(`Valid: ${s.valid_through}`);
      chunks.push({
        title: `Special — ${s.name}`,
        content: lines.join("\n"),
        category: "pricing",
      });
    }
  }

  if (Array.isArray(p.providers) && (p.providers as Provider[]).length) {
    const lines: string[] = [];
    for (const prov of p.providers as Provider[]) {
      if (!prov?.name) continue;
      const bits: string[] = [prov.name];
      if (prov.title) bits.push(prov.title);
      if (prov.specialties && prov.specialties.length) bits.push(`specialties: ${prov.specialties.join(", ")}`);
      lines.push(bits.join(" — "));
      if (prov.bio) lines.push(`  ${prov.bio}`);
    }
    chunks.push({ title: "Providers and staff", content: lines.join("\n"), category: "general" });
  }

  if (p.pricing_notes && !chunks.some((c) => c.category === "pricing")) {
    chunks.push({ title: "Pricing notes", content: String(p.pricing_notes), category: "pricing" });
  }

  // Demo-mode awareness. Retrieved when callers ask edge questions like
  // "are you really the spa?", "what's your refund policy?", "do you
  // accept my insurance?" — Vivienne gracefully acknowledges the limit
  // of what's been researched without making things up or breaking the
  // illusion unprompted. The chunk is intentionally general-purpose so
  // it surfaces on any "policy I don't have on hand" type question.
  chunks.push({
    title: "About this preview experience",
    content: [
      "This phone line is a preview experience set up while the spa owner evaluates VauxVoice as their AI Clientele Specialist.",
      "All information you have access to — services, providers, hours, FAQs — was researched from the spa's own website and public sources.",
      "If a caller asks about something not covered in your knowledge base (a specific refund policy, an insurance question, a custom package, a niche treatment), do NOT invent details. Say warmly that you want to make sure you give them accurate information, and offer to have someone from the team follow up.",
      "If a caller directly and explicitly asks whether you're a real person, an AI, or a demo: answer honestly. You're an AI Clientele Specialist. Don't volunteer this otherwise — most callers don't care, and leading with it breaks rapport.",
      "Never claim to be human. Never pretend you can't check the calendar when you can. Never promise things you can't actually do (driving directions live, complex medical advice, prescriptions).",
    ].join("\n\n"),
    category: "general",
  });

  return chunks;
}

// Small, geographically diverse fallback pool. Vapi rate-limits aggressively
// per-API-key — keep attempts <10 per click. The prospect's actual area code
// is tried FIRST (set by the caller); these are only used if that fails.
const FALLBACK_AREA_CODES = [
  "628", // SF Bay
  "213", // Los Angeles
  "646", // New York
  "305", // Miami
  "713", // Houston
  "404", // Atlanta
  "312", // Chicago
];

const MAX_AREA_CODE_ATTEMPTS = 8;
const DELAY_BETWEEN_ATTEMPTS_MS = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Vapi rejects phone-number.name when it exceeds 40 chars
// ("Bad Request: name must be shorter than or equal to 40 characters"),
// which kills the buy and leaves the prospect un-demoable. Truncate the
// "DEMO - {business}" form at a word boundary so longer business names
// still produce a valid, readable label.
function fitPhoneNumberName(businessName: string): string {
  const full = `DEMO - ${businessName.trim()}`;
  if (full.length <= 40) return full;
  const room = 40 - 1; // reserve one char for the ellipsis
  const trimmed = full.slice(0, room).replace(/\s+\S*$/, "");
  const base = trimmed.length > 0 ? trimmed : full.slice(0, room);
  return base + "…";
}

async function buyPhoneNumber(
  name: string,
  preferredAreaCode: string | null
): Promise<{ id: string; number: string } | { error: string }> {
  const ordered = [preferredAreaCode, ...FALLBACK_AREA_CODES]
    .filter(Boolean)
    .slice(0, MAX_AREA_CODE_ATTEMPTS) as string[];

  const seen = new Set<string>();
  const errors: string[] = [];
  let isFirst = true;

  const phoneNumberName = fitPhoneNumberName(name);

  for (const ac of ordered) {
    if (seen.has(ac)) continue;
    seen.add(ac);

    // Be polite to Vapi — small delay between attempts
    if (!isFirst) await sleep(DELAY_BETWEEN_ATTEMPTS_MS);
    isFirst = false;

    // Modern Vapi endpoint: POST /phone-number with provider:"vapi"
    // (the legacy /phone-number/buy endpoint is deprecated as of late 2025 with 410 Gone)
    const res = await fetch("https://api.vapi.ai/phone-number", {
      method: "POST",
      headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "vapi",
        numberDesiredAreaCode: ac,
        name: phoneNumberName,
        serverUrl: WEBHOOK_URL,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return { id: data.id, number: data.number };
    }
    const errText = await res.text().catch(() => "");
    errors.push(`area ${ac}: ${res.status} ${errText.slice(0, 200)}`);

    if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 429) {
      console.error("[demo-provisioner] Vapi hard error, stopping retries", errors);
      return { error: `Vapi rejected: ${res.status} ${errText.slice(0, 300)}` };
    }
  }

  console.error("[demo-provisioner] No Vapi numbers available", errors);
  const first = errors[0] ?? "Unknown Vapi error";
  return {
    error: `No Vapi numbers available across ${seen.size} area codes. First error — ${first}`,
  };
}

/**
 * Idempotent demo provisioning. Returns the existing demo if one is already linked.
 * Otherwise buys a Vapi number, creates a prospect-status tenant, seeds KB, and links
 * the demo back on the prospect row.
 */
export async function provisionDemoForProspect(prospect_id: string): Promise<ProvisionResult> {
  const { data: prospect, error: pErr } = await supabaseAdmin
    .from("outreach_prospects")
    .select("*")
    .eq("id", prospect_id)
    .single();

  if (pErr || !prospect) return { ok: false, error: "Prospect not found" };

  if (prospect.demo_tenant_id) {
    const { data: existingTenant } = await supabaseAdmin
      .from("tenants")
      .select("phone_number")
      .eq("id", prospect.demo_tenant_id)
      .single();
    return {
      ok: true,
      already_provisioned: true,
      tenant_id: prospect.demo_tenant_id,
      phone_number: existingTenant?.phone_number,
    };
  }

  const preferredArea = areaCodeFrom(prospect.phone) ?? areaCodeFrom(prospect.assigned_demo_number);
  const buyResult = await buyPhoneNumber(prospect.business_name, preferredArea);
  if ("error" in buyResult) return { ok: false, error: buyResult.error };
  const phone = buyResult;

  const slugBase = `demo-${slugify(prospect.business_name)}-${prospect_id.slice(0, 8)}`;
  // Customer-facing greeting — warm, no AI self-id, no persona name (kept generic
  // so it works for any spa). The spa can override this any time via the
  // greeting_message column. If asked "are you an AI?" the agent answers honestly
  // via the system prompt — but doesn't lead with that.
  const greeting = `Welcome to ${prospect.business_name}! We're delighted to hear from you. Anything I can help you with today?`;

  // Normalize the prospect's phone to E.164 so Twilio accepts it as a
  // booking_forward destination. The research agent stores phone as the
  // raw "(415) 555-1212" / "415-555-1212" form; Twilio needs +14155551212.
  const forwardPhone = toE164(prospect.phone as string | null | undefined);

  // Column-tolerant insert: strips any column the tenants table doesn't have
  // (e.g. if older migrations haven't been run yet). Required core columns
  // (name, slug, phone_number, vapi_phone_number_id) must exist or we fail loud.
  let tenantPayload: Record<string, unknown> = {
    name: prospect.business_name,
    slug: slugBase,
    phone_number: phone.number,
    vapi_phone_number_id: phone.id,
    voice_id: "EXAVITQu4vr4xnSDxMaL",
    greeting_message: greeting,
    status: "prospect",
    // Normalize even though the research agent's tightened schema should
    // already produce canonical {open, close} shape — covers any legacy
    // outreach_prospects rows researched before the schema change.
    business_hours: normalizeBusinessHours(prospect.business_hours) ?? null,
    directions_parking_info: prospect.directions_parking_info ?? null,
    system_prompt_override: prospect.system_prompt_override ?? null,
    booking_config: prospect.booking_config ?? null,
    // Demo magic moment: when the prospect calls their own demo number and
    // "books" an appointment, fire a real SMS to their phone so they see the
    // end-to-end flow themselves. Uses platform Twilio creds (TWILIO_*) when
    // no tenant-owned Twilio is connected — which is always true for prospects.
    booking_forward_enabled: Boolean(forwardPhone),
    booking_forward_phones: forwardPhone ? [forwardPhone] : null,
  };

  const droppedTenantCols: string[] = [];
  let tenant: { id: string; phone_number: string } | null = null;
  let lastErr = "";

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .insert(tenantPayload)
      .select("id, phone_number")
      .single();
    if (!error && data) {
      tenant = data;
      break;
    }
    lastErr = error?.message ?? "unknown";
    const missingCol = error?.message.match(/column "?([a-z_][a-z0-9_]*)"?\s+(?:of relation|in the schema cache)/i)
      ?? error?.message.match(/find the '([a-z_][a-z0-9_]*)' column/i);
    const colName = missingCol?.[1];
    if (colName && tenantPayload[colName] !== undefined) {
      droppedTenantCols.push(colName);
      delete tenantPayload[colName];
      continue;
    }
    break;
  }

  if (!tenant) return { ok: false, error: `Failed to create demo tenant: ${lastErr}` };

  if (droppedTenantCols.length) {
    console.warn(
      `[demo-provisioner] tenant created without columns: ${droppedTenantCols.join(", ")} — run pending migrations`
    );
  }

  // Seed staff from researched providers — without this the provider roster
  // prompt block stays empty and the AI punts every "who works there?" call
  // to "our team will be the best to walk you through that".
  await seedStaffFromProviders(tenant.id, prospect.providers);

  // Seed KB (skip gracefully if no OPENAI_API_KEY)
  const chunks = buildKnowledgeChunks(prospect);
  let kbChunksInserted = 0;
  if (chunks.length && process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      for (const chunk of chunks.slice(0, 30)) {
        try {
          const embRes = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: chunk.content,
          });
          await supabaseAdmin.from("knowledge_base_documents").insert({
            tenant_id: tenant.id,
            title: chunk.title,
            content: chunk.content,
            category: chunk.category,
            embedding: embRes.data[0].embedding,
          });
          kbChunksInserted += 1;
        } catch (embErr) {
          console.error("KB embed failed:", chunk.title, embErr);
        }
      }
    } catch (openaiErr) {
      console.error("OpenAI init failed:", openaiErr);
    }
  }

  await supabaseAdmin
    .from("outreach_prospects")
    .update({
      demo_tenant_id: tenant.id,
      demo_provisioned_at: new Date().toISOString(),
      assigned_demo_number: phone.number,
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospect_id);

  await logProspectEvent({
    prospect_id,
    event_type: "demo_provisioned",
    summary: `Demo ready at ${phone.number} (${kbChunksInserted} KB chunks)`,
    payload: { demo_tenant_id: tenant.id, phone_number: phone.number, kb_chunks: kbChunksInserted },
    actor: "agent:demo-provisioner",
  });

  return { ok: true, tenant_id: tenant.id, phone_number: phone.number, kb_chunks: kbChunksInserted };
}
