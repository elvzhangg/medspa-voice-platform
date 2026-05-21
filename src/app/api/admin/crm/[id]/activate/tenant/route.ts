import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  ActivationState,
  TenantDraft,
  appendTurns,
  areaCodeFrom,
  getStep,
  loadProspect,
  nowIso,
  reviseWithChat,
  saveActivationState,
  setStep,
  slugify,
} from "@/lib/crm-activation";
import { areaCodeForCity } from "@/lib/us-area-codes";
import { normalizeBusinessHours } from "@/lib/normalize-hours";
import { seedStaffFromProviders } from "@/lib/staff-seed";
import { provisionBYOTwilioNumber, releaseVapiNumber as releaseVapiByoNumber, releaseTwilioNumber } from "@/lib/twilio-provision";

// seedStaffFromProviders is shared with the demo-provisioner — see
// src/lib/staff-seed.ts. Activation and demo provisioning now seed the
// same way so every tenant has a non-empty staff roster.

export const runtime = "nodejs";
// Buying a Vapi number can take ~10s per attempt and we may try several area
// codes — give the commit step plenty of headroom.
export const maxDuration = 120;

const WEBHOOK_URL =
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://medspa-voice-platform.vercel.app") +
  "/api/vapi/webhook";

// Area-code fallback pool and retry pacing now live in lib/twilio-provision.ts
// so demo + activation share one implementation.

const SYSTEM_PROMPT = `You are helping an admin set up a new tenant in the VauxVoice platform from a researched CRM prospect (a med spa). On commit, the system will buy a Vapi phone number AND create the tenant in one step. The draft has these fields:

- name: business display name (usually the prospect's business_name)
- slug: URL-safe identifier (lowercase, hyphenated, ≤60 chars, must be unique-ish)
- greeting_message: the first thing the AI receptionist says when answering the phone — warm, brief, mentions the spa's name, ends with an offer to help. No "I'm an AI" preamble. Customer-facing.
- voice_id: ElevenLabs voice ID. Default is "EXAVITQu4vr4xnSDxMaL" (a neutral, friendly female voice). Only change if the user explicitly requests a different voice.
- area_code: the 3-digit US area code we will try first when buying the number (string, e.g. "415"). null means no preference, fallback pool will be used.

When the user asks for a change, revise just the field(s) they mention and return the FULL draft. If they ask a question rather than a change, reply with a short answer and return the draft unchanged.

Common requests:
- "use slug X" → update slug only
- "make the greeting shorter" → update greeting_message only
- "try area code 415" or "go local to their phone" → update area_code only
- "use a Miami number" → resolve city to area code (Miami=305, NYC=212, LA=213, SF=415, Chicago=312, Houston=713, Atlanta=404)`;

function defaultDraft(prospect: Record<string, unknown>): TenantDraft {
  const name = String(prospect.business_name ?? "Untitled Spa");
  // Prefer the spa's own phone area code (most "local" feel for the demo
  // number). Fall back to the city's primary area code if no phone is on
  // file. Final null lets the Vapi fallback pool handle it.
  const phoneArea = areaCodeFrom(prospect.phone as string | null);
  const cityArea = areaCodeForCity(prospect.city as string | null);
  return {
    name,
    slug: slugify(name) || `spa-${String(prospect.id).slice(0, 8)}`,
    greeting_message: `Welcome to ${name}! We're delighted to hear from you. Anything I can help you with today?`,
    voice_id: "EXAVITQu4vr4xnSDxMaL",
    area_code: phoneArea ?? cityArea,
  };
}

// sleep helper kept in case other code in this file needs it down the line
function _sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface BuyOk { id: string; number: string; twilioSid: string }
interface BuyErr { error: string; attempted: string[] }

// Number buying now goes through lib/twilio-provision.ts (BYO Twilio flow):
// we buy from our own Twilio account first, then import into Vapi for inbound
// voice. The same number is used for outbound SMS via booking.ts. This thin
// wrapper preserves the BuyOk/BuyErr shape the rest of this file expects.
async function buyVapiNumber(name: string, preferred: string | null): Promise<BuyOk | BuyErr> {
  const result = await provisionBYOTwilioNumber({
    preferredAreaCode: preferred,
    labelPrefix: "CRM",
    businessName: name,
    serverUrl: WEBHOOK_URL,
  });
  if ("error" in result) {
    return { error: result.error, attempted: result.attemptedAreaCodes };
  }
  return {
    id: result.vapiPhoneNumberId,
    number: result.phoneNumber,
    twilioSid: result.twilioSid,
  };
}

// Best-effort cleanup when tenant insert fails after a successful buy.
// Releases BOTH the Vapi import AND the underlying Twilio number so we
// don't pay for an orphan.
async function releaseVapiNumber(phoneNumberId: string, twilioSid?: string): Promise<void> {
  await releaseVapiByoNumber(phoneNumberId);
  if (twilioSid) await releaseTwilioNumber(twilioSid);
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
    if (step.draft) {
      // Backfill area_code on drafts created before the merge so existing
      // wizard sessions don't show a missing field.
      if (step.draft.area_code === undefined) {
        const patched = { ...step, draft: { ...step.draft, area_code: areaCodeFrom(prospect.phone as string | null) } };
        await saveActivationState(id, setStep(state, "tenant", patched));
        return NextResponse.json({ step: patched });
      }
      return NextResponse.json({ step });
    }
    const seeded = { ...step, draft: defaultDraft(prospect) };
    await saveActivationState(id, setStep(state, "tenant", seeded));
    return NextResponse.json({ step: seeded });
  }

  if (action === "chat") {
    if (!body.message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });
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

    revised.slug = slugify(revised.slug || revised.name) || `spa-${id.slice(0, 8)}`;
    revised.area_code = revised.area_code ? String(revised.area_code).replace(/\D/g, "").slice(0, 3) || null : null;

    const updated = appendTurns(
      { ...step, draft: revised },
      [
        { role: "user", content: body.message, at: nowIso() },
        { role: "assistant", content: reply, at: nowIso() },
      ]
    );
    await saveActivationState(id, setStep(state, "tenant", updated));
    return NextResponse.json({ step: updated, reply });
  }

  if (action === "commit") {
    if (!step.draft) return NextResponse.json({ error: "no draft to commit" }, { status: 400 });

    // Already activated — but if the tenant has a sentinel phone (left over
    // from the pre-merge two-step flow), retry the buy and patch the row.
    if (prospect.tenant_id) {
      const { data: existing } = await supabaseAdmin
        .from("tenants")
        .select("id, phone_number")
        .eq("id", prospect.tenant_id)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json({ error: "Linked tenant row missing — clear tenant_id and retry" }, { status: 500 });
      }
      const isSentinel = typeof existing.phone_number === "string" && existing.phone_number.startsWith("pending:");
      if (!isSentinel) {
        return NextResponse.json({ tenant_id: prospect.tenant_id, already: true });
      }
      const buy = await buyVapiNumber(step.draft.name, step.draft.area_code);
      if ("error" in buy) return NextResponse.json({ error: buy.error }, { status: 502 });
      const { error: patchErr } = await supabaseAdmin
        .from("tenants")
        .update({
          phone_number: buy.number,
          vapi_phone_number_id: buy.id,
          twilio_phone_number: buy.number,
          twilio_phone_sid: buy.twilioSid,
          updated_at: nowIso(),
        })
        .eq("id", prospect.tenant_id);
      if (patchErr) {
        await releaseVapiNumber(buy.id, buy.twilioSid);
        return NextResponse.json({ error: `Patched buy failed: ${patchErr.message}` }, { status: 500 });
      }
      const updated = { ...step, committed_at: nowIso() };
      await saveActivationState(id, setStep(state, "tenant", updated));
      return NextResponse.json({ tenant_id: prospect.tenant_id, step: updated, phone_number: buy.number });
    }

    // Buy first — if Vapi can't get us a number, we abort BEFORE creating any
    // tenant row. The user can change area_code via chat and click Commit again.
    const buy = await buyVapiNumber(step.draft.name, step.draft.area_code);
    if ("error" in buy) {
      return NextResponse.json({ error: buy.error, attempted_area_codes: buy.attempted }, { status: 502 });
    }

    // Normalize the prospect's loose business_hours JSONB (research agent may
    // store strings, partial objects, or "Closed") into the strict {open,close}
    // shape that the assistant's hours block expects. Without this, every day
    // shows CLOSED and the AI refuses to offer any availability.
    const normalizedHours = normalizeBusinessHours(prospect.business_hours);

    // Column-tolerant insert mirroring demo-provisioner.ts: drop unknown
    // columns one at a time so we don't break on schema drift. If the insert
    // fails for any other reason we release the just-purchased Vapi number
    // so it doesn't dangle on the account.
    const payload: Record<string, unknown> = {
      name: step.draft.name,
      slug: step.draft.slug,
      phone_number: buy.number,
      vapi_phone_number_id: buy.id,
      // Same number now lives in our Twilio account too — booking.ts uses
      // these for outbound SMS so the spa can text from their AI number.
      twilio_phone_number: buy.number,
      twilio_phone_sid: buy.twilioSid,
      voice_id: step.draft.voice_id,
      greeting_message: step.draft.greeting_message,
      status: "prospect",
      business_hours: normalizedHours,
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

    if (!tenantId) {
      await releaseVapiNumber(buy.id, buy.twilioSid);
      return NextResponse.json({ error: `Failed to create tenant (Vapi + Twilio number released): ${lastErr}` }, { status: 500 });
    }

    // Seed providers from prospect.providers into the staff table so the
    // assistant's roster prompt is populated. Without this, the AI defers
    // every "who works there?" / "tell me about your team" question to a
    // human callback. Failures are non-fatal.
    const staffSeed = await seedStaffFromProviders(tenantId, prospect.providers);

    const updated = { ...step, committed_at: nowIso() };
    await saveActivationState(id, setStep(state, "tenant", updated));

    await supabaseAdmin
      .from("crm_prospects")
      .update({ tenant_id: tenantId, updated_at: nowIso() })
      .eq("id", id);

    return NextResponse.json({
      tenant_id: tenantId,
      step: updated,
      phone_number: buy.number,
      seeded: { staff: staffSeed, hours_normalized: !!normalizedHours },
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
