import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { logProspectEvent } from "@/lib/prospect-events";

export const runtime = "nodejs";
export const maxDuration = 120;

const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const WEBHOOK_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://medspa-voice-platform.vercel.app") + "/api/vapi/webhook";

interface Procedure { name: string; description?: string; duration_min?: number; price?: string | number; notes?: string }
interface Provider { name: string; title?: string; specialties?: string[]; bio?: string }
interface HoursValue { open?: string; close?: string }

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function areaCodeFrom(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const stripped = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  return stripped.length >= 3 ? stripped.slice(0, 3) : null;
}

/**
 * Builds KB chunks from a prospect's structured profile. Each chunk gets embedded
 * and stored so the voice agent can cite it at call time.
 */
function buildKnowledgeChunks(p: Record<string, unknown>): Array<{ title: string; content: string; category: "services" | "pricing" | "policies" | "faq" | "general" }> {
  const chunks: Array<{ title: string; content: string; category: "services" | "pricing" | "policies" | "faq" | "general" }> = [];

  // Overview
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

  // Hours
  if (p.hours && typeof p.hours === "object") {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const lines: string[] = [];
    for (const day of days) {
      const val = (p.hours as Record<string, HoursValue | string>)[day];
      if (val == null) continue;
      const display = typeof val === "string" ? val : val.open && val.close ? `${val.open}–${val.close}` : "";
      if (display) lines.push(`${day.charAt(0).toUpperCase() + day.slice(1)}: ${display}`);
    }
    if (lines.length) {
      chunks.push({ title: "Hours of operation", content: lines.join("\n"), category: "policies" });
    }
  }

  // Each procedure as its own chunk — gets cleaner vector search matches than one giant dump
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

  // Providers
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

  // Unstructured pricing fallback
  if (p.pricing_notes && !chunks.some((c) => c.category === "pricing")) {
    chunks.push({ title: "Pricing notes", content: String(p.pricing_notes), category: "pricing" });
  }

  return chunks;
}

async function buyPhoneNumber(name: string, preferredAreaCode: string | null): Promise<{ id: string; number: string } | null> {
  const areaCodesToTry = [preferredAreaCode, "628", "415", "510", "408", "323", "646", "212", "917"].filter(Boolean) as string[];
  const seen = new Set<string>();
  for (const ac of areaCodesToTry) {
    if (seen.has(ac)) continue;
    seen.add(ac);
    const res = await fetch("https://api.vapi.ai/phone-number/buy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
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
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { prospect_id } = (await req.json()) as { prospect_id?: string };
  if (!prospect_id) {
    return NextResponse.json({ error: "prospect_id required" }, { status: 400 });
  }

  const { data: prospect, error: pErr } = await supabaseAdmin
    .from("outreach_prospects")
    .select("*")
    .eq("id", prospect_id)
    .single();

  if (pErr || !prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  // Idempotency: if demo already exists, return it.
  if (prospect.demo_tenant_id) {
    const { data: existingTenant } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .eq("id", prospect.demo_tenant_id)
      .single();
    return NextResponse.json({
      ok: true,
      already_provisioned: true,
      tenant: existingTenant,
      phone_number: existingTenant?.phone_number,
    });
  }

  // 1. Buy a Vapi number — try the prospect's own area code first for a local-feeling demo
  const preferredArea = areaCodeFrom(prospect.phone) ?? areaCodeFrom(prospect.assigned_demo_number);
  const phone = await buyPhoneNumber(prospect.business_name, preferredArea);
  if (!phone) {
    return NextResponse.json({ error: "Could not provision Vapi phone number" }, { status: 502 });
  }

  // 2. Create prospect tenant
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
      business_hours: prospect.hours ?? null,
    })
    .select()
    .single();

  if (tErr || !tenant) {
    return NextResponse.json({ error: `Failed to create demo tenant: ${tErr?.message}` }, { status: 500 });
  }

  // 3. Seed knowledge base from structured profile
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
          console.error("KB embed failed for chunk:", chunk.title, embErr);
        }
      }
    } catch (openaiErr) {
      console.error("OpenAI init failed:", openaiErr);
    }
  }

  // 4. Link demo tenant back on prospect row
  const { error: linkErr } = await supabaseAdmin
    .from("outreach_prospects")
    .update({
      demo_tenant_id: tenant.id,
      demo_provisioned_at: new Date().toISOString(),
      assigned_demo_number: phone.number,
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospect_id);

  if (linkErr) {
    console.error("Failed to link demo tenant to prospect:", linkErr);
  }

  await logProspectEvent({
    prospect_id,
    event_type: "demo_provisioned",
    summary: `Demo agent ready at ${phone.number} (${kbChunksInserted} KB chunks)`,
    payload: { demo_tenant_id: tenant.id, phone_number: phone.number, kb_chunks: kbChunksInserted },
    actor: "agent:demo-provisioner",
  });

  return NextResponse.json({
    ok: true,
    tenant,
    phone_number: phone.number,
    kb_chunks: kbChunksInserted,
  });
}
