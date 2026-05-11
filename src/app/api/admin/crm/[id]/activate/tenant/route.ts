import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  ActivationState,
  TenantDraft,
  appendTurns,
  getStep,
  loadProspect,
  nowIso,
  reviseWithChat,
  saveActivationState,
  setStep,
  slugify,
} from "@/lib/crm-activation";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are helping an admin set up a new tenant in the VauxVoice platform from a researched CRM prospect (a med spa). The tenant draft has these fields:

- name: business display name (usually the prospect's business_name)
- slug: URL-safe identifier (lowercase, hyphenated, ≤60 chars, must be unique-ish)
- greeting_message: the first thing the AI receptionist says when answering the phone — warm, brief, mentions the spa's name, ends with an offer to help. No "I'm an AI" preamble. Customer-facing.
- voice_id: ElevenLabs voice ID. Default is "EXAVITQu4vr4xnSDxMaL" (a neutral, friendly female voice). Only change if the user explicitly requests a different voice.

When the user asks for a change, revise just the field(s) they mention and return the FULL draft. If they ask a question rather than a change, reply with a short answer and return the draft unchanged.`;

function defaultDraft(prospect: Record<string, unknown>): TenantDraft {
  const name = String(prospect.business_name ?? "Untitled Spa");
  return {
    name,
    slug: slugify(name) || `spa-${String(prospect.id).slice(0, 8)}`,
    greeting_message: `Welcome to ${name}! We're delighted to hear from you. Anything I can help you with today?`,
    voice_id: "EXAVITQu4vr4xnSDxMaL",
  };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "draft" | "chat" | "commit";
    message?: string;
  };
  const action = body.action;
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const prospect = await loadProspect(id);
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  const state: ActivationState = (prospect.activation_state as ActivationState) ?? {};
  const step = getStep<TenantDraft>(state, "tenant");

  if (action === "draft") {
    // Idempotent: if a draft already exists, return it. Otherwise seed from
    // the prospect record. Never overwrites an in-flight conversation.
    if (step.draft) return NextResponse.json({ step });
    const seeded = { ...step, draft: defaultDraft(prospect) };
    const next = setStep(state, "tenant", seeded);
    await saveActivationState(id, next);
    return NextResponse.json({ step: seeded });
  }

  if (action === "chat") {
    if (!body.message?.trim()) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    if (!step.draft) return NextResponse.json({ error: "no draft yet — call action:draft first" }, { status: 400 });

    let revised: TenantDraft;
    let reply: string;
    try {
      const result = await reviseWithChat<TenantDraft>({
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

    // Force-coerce slug just in case the model returned something invalid.
    revised.slug = slugify(revised.slug || revised.name) || `spa-${id.slice(0, 8)}`;

    const updatedStep = appendTurns(
      { ...step, draft: revised },
      [
        { role: "user", content: body.message, at: nowIso() },
        { role: "assistant", content: reply, at: nowIso() },
      ]
    );
    const next = setStep(state, "tenant", updatedStep);
    await saveActivationState(id, next);
    return NextResponse.json({ step: updatedStep, reply });
  }

  if (action === "commit") {
    if (!step.draft) return NextResponse.json({ error: "no draft to commit" }, { status: 400 });
    if (prospect.tenant_id) {
      // Already activated — return the link without inserting a duplicate row.
      return NextResponse.json({ tenant_id: prospect.tenant_id, already: true });
    }

    // Column-tolerant insert mirroring demo-provisioner.ts: drop unknown
    // columns one at a time so we don't break on prospect-only fields the
    // local tenants table is missing.
    // tenants.phone_number is NOT NULL UNIQUE, but in this wizard the number
    // isn't provisioned until Step 2. Insert a per-prospect sentinel that
    // Step 2 will overwrite with the real Vapi number. The sentinel is
    // deliberately not a valid phone format so it can't accidentally collide
    // with a real number and is easy to spot in logs/admin lists.
    const payload: Record<string, unknown> = {
      name: step.draft.name,
      slug: step.draft.slug,
      phone_number: `pending:${id}`,
      voice_id: step.draft.voice_id,
      greeting_message: step.draft.greeting_message,
      status: "prospect",
      business_hours: prospect.business_hours ?? null,
    };

    let tenantId: string | null = null;
    let lastErr = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      const { data, error } = await supabaseAdmin
        .from("tenants")
        .insert(payload)
        .select("id")
        .single();
      if (!error && data) {
        tenantId = data.id;
        break;
      }
      lastErr = error?.message ?? "unknown";
      const m = error?.message.match(/column "?([a-z_][a-z0-9_]*)"?\s+(?:of relation|in the schema cache)/i)
        ?? error?.message.match(/find the '([a-z_][a-z0-9_]*)' column/i);
      const col = m?.[1];
      if (col && payload[col] !== undefined) {
        delete payload[col];
        continue;
      }
      // Slug uniqueness conflict — append a short suffix and retry once.
      if (error?.message.includes("duplicate") && payload.slug) {
        payload.slug = `${String(payload.slug).slice(0, 50)}-${id.slice(0, 6)}`;
        continue;
      }
      break;
    }

    if (!tenantId) return NextResponse.json({ error: `Failed to create tenant: ${lastErr}` }, { status: 500 });

    const updatedStep = { ...step, committed_at: nowIso() };
    const next = setStep(state, "tenant", updatedStep);
    await saveActivationState(id, next);

    // Link the tenant FK on the prospect row. Done in a separate update so the
    // activation_state save above isn't lost if this fails.
    await supabaseAdmin
      .from("crm_prospects")
      .update({ tenant_id: tenantId, updated_at: nowIso() })
      .eq("id", id);

    return NextResponse.json({ tenant_id: tenantId, step: updatedStep });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
