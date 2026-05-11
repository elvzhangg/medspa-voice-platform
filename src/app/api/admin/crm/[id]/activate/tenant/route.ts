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

export const runtime = "nodejs";
// Buying a Vapi number can take ~10s per attempt and we may try several area
// codes — give the commit step plenty of headroom.
export const maxDuration = 120;

const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const WEBHOOK_URL =
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://medspa-voice-platform.vercel.app") +
  "/api/vapi/webhook";

const FALLBACK_AREA_CODES = ["628", "213", "646", "305", "713", "404", "312"];
const MAX_AREA_CODE_ATTEMPTS = 8;
const DELAY_BETWEEN_ATTEMPTS_MS = 200;

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface BuyOk { id: string; number: string }
interface BuyErr { error: string; attempted: string[] }

// Tries the preferred area code first, then walks a small geographic fallback
// pool. Stops on hard errors (auth/quota/rate) so we don't burn the API key.
async function buyVapiNumber(name: string, preferred: string | null): Promise<BuyOk | BuyErr> {
  const ordered = [preferred, ...FALLBACK_AREA_CODES]
    .filter(Boolean)
    .slice(0, MAX_AREA_CODE_ATTEMPTS) as string[];

  const seen = new Set<string>();
  const errors: string[] = [];
  let isFirst = true;

  for (const ac of ordered) {
    if (seen.has(ac)) continue;
    seen.add(ac);
    if (!isFirst) await sleep(DELAY_BETWEEN_ATTEMPTS_MS);
    isFirst = false;

    const res = await fetch("https://api.vapi.ai/phone-number", {
      method: "POST",
      headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "vapi",
        numberDesiredAreaCode: ac,
        name: `CRM - ${name}`,
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
      return { error: `Vapi rejected: ${res.status} ${errText.slice(0, 300)}`, attempted: [...seen] };
    }
  }
  const first = errors[0] ?? "Unknown Vapi error";
  return {
    error: `No Vapi numbers available across ${seen.size} area codes. First — ${first}`,
    attempted: [...seen],
  };
}

// Best-effort release of an orphaned Vapi number (e.g. tenant insert failed
// after we already paid for the number). Logs on failure but doesn't block.
async function releaseVapiNumber(phoneNumberId: string): Promise<void> {
  try {
    await fetch(`https://api.vapi.ai/phone-number/${phoneNumberId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    });
  } catch (e) {
    console.error("[activation] failed to release orphaned Vapi number", phoneNumberId, e);
  }
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
        .update({ phone_number: buy.number, vapi_phone_number_id: buy.id, updated_at: nowIso() })
        .eq("id", prospect.tenant_id);
      if (patchErr) {
        await releaseVapiNumber(buy.id);
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

    // Column-tolerant insert mirroring demo-provisioner.ts: drop unknown
    // columns one at a time so we don't break on schema drift. If the insert
    // fails for any other reason we release the just-purchased Vapi number
    // so it doesn't dangle on the account.
    const payload: Record<string, unknown> = {
      name: step.draft.name,
      slug: step.draft.slug,
      phone_number: buy.number,
      vapi_phone_number_id: buy.id,
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

    if (!tenantId) {
      await releaseVapiNumber(buy.id);
      return NextResponse.json({ error: `Failed to create tenant (Vapi number released): ${lastErr}` }, { status: 500 });
    }

    const updated = { ...step, committed_at: nowIso() };
    await saveActivationState(id, setStep(state, "tenant", updated));

    await supabaseAdmin
      .from("crm_prospects")
      .update({ tenant_id: tenantId, updated_at: nowIso() })
      .eq("id", id);

    return NextResponse.json({ tenant_id: tenantId, step: updated, phone_number: buy.number });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
