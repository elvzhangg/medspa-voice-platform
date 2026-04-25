import { supabaseAdmin } from "./supabase";
import { logProspectEvent } from "./prospect-events";

const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const WEBHOOK_URL =
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://medspa-voice-platform.vercel.app") +
  "/api/vapi/webhook";

interface Procedure { name: string; description?: string; duration_min?: number; price?: string | number; notes?: string }
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

  return chunks;
}

// Broad pool of common US area codes. Vapi requires `areaCode` and there's no
// "any number" mode — so we just cycle through a wide enough pool that at least
// one usually has stock.
const FALLBACK_AREA_CODES = [
  // California
  "628", "415", "510", "408", "650",
  "213", "310", "323", "424", "818", "626", "562", "619", "858", "949", "714", "805", "661",
  "916", "209", "559", "707", "530",
  // New York
  "646", "212", "917", "718", "347", "631", "516", "914",
  // Florida (lots of med spas)
  "305", "786", "954", "561", "407", "813",
  // Texas (lots of med spas)
  "214", "469", "972", "713", "281", "832", "512", "210",
  // Other major markets
  "404", "678", "770", // Atlanta
  "312", "773", "847", // Chicago
  "602", "480", // Phoenix
  "702", // Las Vegas
  "303", "720", // Denver
];

async function buyPhoneNumber(
  name: string,
  preferredAreaCode: string | null
): Promise<{ id: string; number: string } | { error: string }> {
  const ordered = [preferredAreaCode, ...FALLBACK_AREA_CODES].filter(Boolean) as string[];
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const ac of ordered) {
    if (seen.has(ac)) continue;
    seen.add(ac);
    const res = await fetch("https://api.vapi.ai/phone-number/buy", {
      method: "POST",
      headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        areaCode: ac,
        name: `DEMO - ${name}`,
        server: { url: WEBHOOK_URL },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return { id: data.id, number: data.number };
    }
    const errText = await res.text().catch(() => "");
    errors.push(`area ${ac}: ${res.status} ${errText.slice(0, 200)}`);

    // If we get a non-availability error (auth/billing/rate-limit), bail immediately
    // — no point cycling through all area codes
    if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 429) {
      console.error("[demo-provisioner] Vapi rejected with hard error, stopping retries", errors);
      return { error: `Vapi rejected: ${res.status} ${errText.slice(0, 300)}` };
    }
  }

  // Surface the FIRST area-code error (most informative — fallback codes often share the cause)
  console.error("[demo-provisioner] Vapi phone-number buy failed across all area codes", errors);
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
  const greeting = `Hi, thank you for calling ${prospect.business_name}! I'm your AI receptionist. How can I help you today?`;

  const { data: tenant, error: tErr } = await supabaseAdmin
    .from("tenants")
    .insert({
      name: prospect.business_name,
      slug: slugBase,
      phone_number: phone.number,
      vapi_phone_number_id: phone.id,
      voice_id: "EXAVITQu4vr4xnSDxMaL",
      greeting_message: greeting,
      status: "prospect",
      business_hours: prospect.business_hours ?? null,
      directions_parking_info: prospect.directions_parking_info ?? null,
      system_prompt_override: prospect.system_prompt_override ?? null,
      booking_config: prospect.booking_config ?? null,
    })
    .select()
    .single();

  if (tErr || !tenant) return { ok: false, error: `Failed to create demo tenant: ${tErr?.message}` };

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
