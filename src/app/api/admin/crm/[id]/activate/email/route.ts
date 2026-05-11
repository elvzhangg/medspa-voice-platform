import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase";
import {
  ActivationState,
  EmailDraft,
  appendTurns,
  getStep,
  loadProspect,
  nowIso,
  reviseWithChat,
  saveActivationState,
  setStep,
} from "@/lib/crm-activation";

export const runtime = "nodejs";
export const maxDuration = 60;

const FROM_EMAIL = process.env.OUTREACH_FROM_EMAIL ?? "hello@vauxvoice.com";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the lead growth writer at VauxVoice — an AI voice receptionist platform built specifically for med spas. You're refining an outbound email to ONE specific med spa owner inviting them to call their personal demo number (which has been pre-trained on their spa's services, providers, and hours).

Constraints (do not violate):
- Plain text only (no HTML, no markdown)
- Under 180 words
- Never invent facts about the spa beyond what the user/draft already includes
- The demo phone number must appear on its own line, clearly visible
- Sign off as "The VauxVoice team"
- No "Quick question" / "Just checking in" clichés

The draft has fields:
- subject: under 55 chars, specific
- body: plain text email body

When the user asks for a change, revise just what they mention and return the FULL draft. If they ask a question, answer briefly and return the draft unchanged.`;

interface SeedContext {
  business_name: string;
  owner_name: string | null;
  city: string | null;
  state: string | null;
  booking_platform: string | null;
  procedures: Array<{ name: string; price?: string | number }>;
  providers: Array<{ name: string; title?: string }>;
  demo_number: string | null;
  recipient_email: string | null;
}

function buildContext(prospect: Record<string, unknown>, demoNumber: string | null): SeedContext {
  return {
    business_name: String(prospect.business_name ?? ""),
    owner_name: (prospect.owner_name as string | null) ?? null,
    city: (prospect.city as string | null) ?? null,
    state: (prospect.state as string | null) ?? null,
    booking_platform: (prospect.booking_platform as string | null) ?? null,
    procedures: ((prospect.procedures as Array<{ name: string; price?: string | number }> | null) ?? []).slice(0, 8),
    providers: ((prospect.providers as Array<{ name: string; title?: string }> | null) ?? []).slice(0, 5),
    demo_number: demoNumber,
    recipient_email: (prospect.owner_email as string | null) ?? (prospect.email as string | null) ?? null,
  };
}

async function generateInitialDraft(ctx: SeedContext): Promise<EmailDraft> {
  const recipientName = ctx.owner_name ? ctx.owner_name.split(/\s+/)[0] : null;
  const recipientLine = recipientName ? `Hi ${recipientName},` : "Hi there,";

  const briefLines: string[] = [];
  briefLines.push(`Business: ${ctx.business_name}`);
  if (ctx.city || ctx.state) briefLines.push(`Location: ${[ctx.city, ctx.state].filter(Boolean).join(", ")}`);
  if (ctx.booking_platform) briefLines.push(`Booking platform: ${ctx.booking_platform}`);
  if (ctx.procedures.length) {
    briefLines.push(
      `Key procedures: ${ctx.procedures.map((p) => (p.price ? `${p.name} (${p.price})` : p.name)).join(", ")}`
    );
  }
  if (ctx.providers.length) {
    briefLines.push(`Providers: ${ctx.providers.map((p) => (p.title ? `${p.name} (${p.title})` : p.name)).join(", ")}`);
  }

  const userPrompt = `Prospect brief:
${briefLines.join("\n")}

${ctx.demo_number ? `Demo number for this prospect (already trained on their data): ${ctx.demo_number}` : `Note: demo number not yet provisioned. Open with the same warm context but invite a reply to schedule a live walkthrough instead of including a number.`}

Recipient salutation: ${recipientLine}

Write the email now. Reference at least one concrete spa-specific detail (procedure, provider, booking platform, or location) to prove this isn't a mass blast.

Respond with JSON only: {"subject": "...", "body": "..."}.`;

  const res = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  let text = "";
  for (const block of res.content) {
    if (block.type === "text") text += block.text;
  }
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`Model returned no JSON. Raw: ${text.slice(0, 400)}`);
  const parsed = JSON.parse(m[0]) as { subject?: string; body?: string };
  return {
    subject: String(parsed.subject ?? "").trim(),
    body: String(parsed.body ?? "").trim(),
  };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "draft" | "chat" | "send" | "regenerate" | "edit";
    message?: string;
    subject?: string;
    body?: string;
  };
  const action = body.action;
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const prospect = await loadProspect(id);
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  const state: ActivationState = (prospect.activation_state as ActivationState) ?? {};
  const step = getStep<EmailDraft>(state, "email");

  // Resolve demo number from the activated tenant if it exists. Falls back to
  // null if Step 2 hasn't completed — the draft prompt handles that case.
  let demoNumber: string | null = null;
  if (prospect.tenant_id) {
    const { data: t } = await supabaseAdmin
      .from("tenants")
      .select("phone_number")
      .eq("id", prospect.tenant_id)
      .maybeSingle();
    demoNumber = (t?.phone_number as string | null) ?? null;
  }

  if (action === "draft" || action === "regenerate") {
    if (action === "draft" && step.draft) return NextResponse.json({ step });
    let draft: EmailDraft;
    try {
      draft = await generateInitialDraft(buildContext(prospect, demoNumber));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
    if (!draft.subject || !draft.body) {
      return NextResponse.json({ error: "Model returned empty draft" }, { status: 502 });
    }
    const seeded = { ...step, draft };
    await saveActivationState(id, setStep(state, "email", seeded));
    return NextResponse.json({ step: seeded });
  }

  if (action === "chat") {
    if (!body.message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });
    if (!step.draft) return NextResponse.json({ error: "no draft yet — call action:draft first" }, { status: 400 });

    let revised: EmailDraft;
    let reply: string;
    try {
      const result = await reviseWithChat<EmailDraft>({
        systemPrompt: SYSTEM_PROMPT,
        currentDraft: step.draft,
        history: step.chat,
        userMessage: body.message,
      });
      revised = result.revised;
      reply = result.reply;
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }

    const updated = appendTurns(
      { ...step, draft: { subject: String(revised.subject ?? "").trim(), body: String(revised.body ?? "").trim() } },
      [
        { role: "user", content: body.message, at: nowIso() },
        { role: "assistant", content: reply, at: nowIso() },
      ]
    );
    await saveActivationState(id, setStep(state, "email", updated));
    return NextResponse.json({ step: updated, reply });
  }

  if (action === "edit") {
    // Direct manual edit — bypasses Claude. Subsequent chat turns will revise
    // from the edited draft, so manual tweaks won't get clobbered unless the
    // user explicitly asks the agent to rewrite.
    if (!step.draft) return NextResponse.json({ error: "no draft to edit" }, { status: 400 });
    if (step.sent_at) return NextResponse.json({ error: "already sent — cannot edit" }, { status: 400 });
    const subject = String(body.subject ?? "").trim();
    const bodyText = String(body.body ?? "").trim();
    if (!subject || !bodyText) return NextResponse.json({ error: "subject and body required" }, { status: 400 });
    const updated = { ...step, draft: { subject, body: bodyText } };
    await saveActivationState(id, setStep(state, "email", updated));
    return NextResponse.json({ step: updated });
  }

  if (action === "send") {
    if (!step.draft) return NextResponse.json({ error: "no draft to send" }, { status: 400 });
    if (step.sent_at) return NextResponse.json({ step, already: true });

    const recipient = (prospect.owner_email as string | null) ?? (prospect.email as string | null);
    if (!recipient) return NextResponse.json({ error: "No owner_email or email on prospect" }, { status: 400 });
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 500 });
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: FROM_EMAIL,
        to: recipient,
        subject: step.draft.subject,
        text: step.draft.body,
      });
    } catch (e) {
      return NextResponse.json({ error: `Resend failed: ${(e as Error).message}` }, { status: 502 });
    }

    const updated = { ...step, sent_at: nowIso(), sent_to: recipient };
    await saveActivationState(id, setStep(state, "email", updated));
    return NextResponse.json({ step: updated });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
