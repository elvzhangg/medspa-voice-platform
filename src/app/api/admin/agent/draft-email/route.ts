import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { logProspectEvent } from "@/lib/prospect-events";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface Procedure { name: string; price?: string | number }
interface Provider { name: string; title?: string }

function buildProspectBrief(p: Record<string, unknown>): string {
  const parts: string[] = [];
  parts.push(`Business: ${p.business_name}`);
  if (p.city || p.state) parts.push(`Location: ${[p.city, p.state].filter(Boolean).join(", ")}`);
  if (p.booking_platform && p.booking_platform !== "Unknown") parts.push(`Booking platform: ${p.booking_platform}`);
  if (p.owner_name) parts.push(`Owner/manager: ${p.owner_name}${p.owner_title ? ` (${p.owner_title})` : ""}`);
  if (p.website) parts.push(`Website: ${p.website}`);

  if (Array.isArray(p.procedures) && (p.procedures as Procedure[]).length) {
    const procs = (p.procedures as Procedure[])
      .slice(0, 8)
      .map((x) => (x.price != null && String(x.price).trim() ? `${x.name} (${x.price})` : x.name))
      .join(", ");
    parts.push(`Key procedures: ${procs}`);
  } else if (p.services_summary) {
    parts.push(`Services: ${p.services_summary}`);
  }

  if (Array.isArray(p.providers) && (p.providers as Provider[]).length) {
    const provs = (p.providers as Provider[])
      .slice(0, 5)
      .map((x) => (x.title ? `${x.name} (${x.title})` : x.name))
      .join(", ");
    parts.push(`Providers: ${provs}`);
  }

  if (Array.isArray(p.locations) && (p.locations as Array<{ label?: string }>).length > 1) {
    parts.push(`Multi-location: ${(p.locations as Array<{ label?: string }>).length} sites`);
  }

  return parts.join("\n");
}

export async function POST(req: NextRequest) {
  const { prospect_id, free_trial_hint } = (await req.json()) as {
    prospect_id?: string;
    free_trial_hint?: boolean;
  };

  if (!prospect_id) {
    return NextResponse.json({ error: "prospect_id required" }, { status: 400 });
  }

  const { data: prospect, error } = await supabaseAdmin
    .from("outreach_prospects")
    .select("*")
    .eq("id", prospect_id)
    .single();

  if (error || !prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const demoNumber: string | null = prospect.assigned_demo_number ?? null;
  const recipientName = prospect.owner_name ? String(prospect.owner_name).split(/\s+/)[0] : null;
  const recipientLine = recipientName ? `Hi ${recipientName},` : "Hi there,";

  const brief = buildProspectBrief(prospect);

  const systemPrompt = `You are the lead growth writer at VauxVoice — an AI voice receptionist platform built specifically for med spas. Your job: draft a single outbound email that feels human, specific, and respectful of the reader's time.

You are writing ONE email to ONE specific prospect. Use the brief to personalize it. Your email will be read by a med spa owner or manager.

Constraints:
- Plain text only (no HTML, no markdown)
- Under 180 words
- No cheesy subject lines, no "Quick question" clichés
- Reference at least one concrete detail from the brief (a specific procedure, provider, booking platform, or location) to prove this isn't a mass blast
- The main call-to-action is: **"Call the demo number to hear your own AI receptionist speak."** Make that number stand out on its own line.
- Secondary CTA: reply to this email to book a 15-min walkthrough
${free_trial_hint ? `- You may mention that we're offering a free trial window for early customers — keep it light, don't anchor on pricing` : `- Do NOT mention pricing, plans, or discounts. Keep pricing conversations for a live call.`}
- Sign off as "The VauxVoice team" (no fake names)

VauxVoice in one line: An AI receptionist that answers every call 24/7, books into ${prospect.booking_platform && prospect.booking_platform !== "Unknown" ? prospect.booking_platform : "your existing booking system"}, and never misses a lead — trained specifically on your spa's services, providers, and hours.

Return two fields: subject (under 55 chars, specific, lowercase-style OK) and body (plain text).`;

  const userPrompt = `Prospect brief:
${brief}

${demoNumber ? `Demo number for this prospect (trained on their data): ${demoNumber}` : `Note: demo number has NOT been provisioned yet. Omit the call-to-call CTA and instead invite a reply to set up a live demo.`}

Recipient salutation: ${recipientLine}

Write the email now. Respond with JSON: {"subject": "...", "body": "..."}.`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Pull text blocks out of the response
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  // Extract JSON — the model occasionally wraps it in prose or fences
  let subject = "";
  let body = "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      subject = String(parsed.subject ?? "").trim();
      body = String(parsed.body ?? "").trim();
    }
  } catch {
    // fall through — leave empty, caller will see 422
  }

  if (!subject || !body) {
    return NextResponse.json(
      { error: "Failed to parse model output", raw: text },
      { status: 422 }
    );
  }

  const { error: updateErr } = await supabaseAdmin
    .from("outreach_prospects")
    .update({
      email_draft_subject: subject,
      email_draft_body: body,
      email_approved: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospect_id);

  if (updateErr) {
    return NextResponse.json({ error: `Failed to save draft: ${updateErr.message}` }, { status: 500 });
  }

  await logProspectEvent({
    prospect_id,
    event_type: "email_drafted",
    summary: `Draft: "${subject}"${demoNumber ? ` — includes demo number ${demoNumber}` : " — no demo number yet"}`,
    actor: "agent:email",
  });

  return NextResponse.json({ ok: true, subject, body });
}
