import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  ActivationState,
  NumberDraft,
  appendTurns,
  areaCodeFrom,
  getStep,
  loadProspect,
  nowIso,
  reviseWithChat,
  saveActivationState,
  setStep,
} from "@/lib/crm-activation";

export const runtime = "nodejs";
export const maxDuration = 120;

const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const WEBHOOK_URL =
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://medspa-voice-platform.vercel.app") +
  "/api/vapi/webhook";

// Geographic fallback pool — same set used by demo-provisioner. Caller's
// preferred area is always tried FIRST, these only fire if that fails.
const FALLBACK_AREA_CODES = ["628", "213", "646", "305", "713", "404", "312"];
const MAX_AREA_CODE_ATTEMPTS = 8;
const DELAY_BETWEEN_ATTEMPTS_MS = 200;

const SYSTEM_PROMPT = `You are helping an admin assign a Vapi phone number to a med spa being activated. The draft has:
- area_code: the 3-digit area code we will try first (string, e.g. "415"). null means no preference.
- status: "pending" | "provisioned" | "failed"

The user can ask to change area_code (e.g. "use 628", "try 305", "go local to their phone"). You only revise area_code; never touch status. If the user asks something else (e.g. "what happens if it fails?"), reply briefly and return the draft unchanged.

If the user mentions a US city, look up its primary area code (e.g. SF→415, NYC→212, LA→213, Miami→305) and set area_code to that.`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface BuyOk { id: string; number: string }
interface BuyErr { error: string }

async function buyPhoneNumber(
  name: string,
  preferred: string | null
): Promise<BuyOk | BuyErr> {
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
    // Hard errors — auth/quota/rate — stop immediately, surfacing the error.
    if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 429) {
      return { error: `Vapi rejected: ${res.status} ${errText.slice(0, 300)}` };
    }
  }
  const first = errors[0] ?? "Unknown Vapi error";
  return { error: `No Vapi numbers available across ${seen.size} area codes. First — ${first}` };
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
  const step = getStep<NumberDraft>(state, "number");

  if (action === "draft") {
    if (step.draft) return NextResponse.json({ step });
    const seeded: typeof step = {
      ...step,
      draft: {
        area_code: areaCodeFrom(prospect.phone as string | null),
        status: "pending",
      },
    };
    const next = setStep(state, "number", seeded);
    await saveActivationState(id, next);
    return NextResponse.json({ step: seeded });
  }

  if (action === "chat") {
    if (!body.message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });
    if (!step.draft) return NextResponse.json({ error: "no draft yet — call action:draft first" }, { status: 400 });

    let revised: NumberDraft;
    let reply: string;
    try {
      const result = await reviseWithChat<NumberDraft>({
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
    // Sanitize: model shouldn't change status from chat; reset to pending if
    // the area code changed so a retry is meaningful.
    const status: NumberDraft["status"] = revised.area_code !== step.draft.area_code ? "pending" : step.draft.status;
    const sanitized: NumberDraft = {
      area_code: revised.area_code ? String(revised.area_code).replace(/\D/g, "").slice(0, 3) || null : null,
      status,
      phone_number: step.draft.phone_number,
      vapi_phone_number_id: step.draft.vapi_phone_number_id,
      last_error: status === "pending" ? null : step.draft.last_error,
    };

    const updated = appendTurns(
      { ...step, draft: sanitized },
      [
        { role: "user", content: body.message, at: nowIso() },
        { role: "assistant", content: reply, at: nowIso() },
      ]
    );
    const next = setStep(state, "number", updated);
    await saveActivationState(id, next);
    return NextResponse.json({ step: updated, reply });
  }

  if (action === "commit") {
    if (!step.draft) return NextResponse.json({ error: "no draft to commit" }, { status: 400 });
    if (!prospect.tenant_id) {
      return NextResponse.json({ error: "Activate the tenant step first" }, { status: 400 });
    }
    if (step.draft.status === "provisioned") {
      return NextResponse.json({ step, already: true });
    }

    const result = await buyPhoneNumber(
      String(prospect.business_name ?? "Tenant"),
      step.draft.area_code
    );

    if ("error" in result) {
      // Retry-later: persist the failure on the draft so the page shows a
      // "Number pending" banner and a Retry button. Other steps remain usable.
      const failedDraft: NumberDraft = {
        ...step.draft,
        status: "failed",
        last_error: result.error,
      };
      const updated = { ...step, draft: failedDraft };
      const next = setStep(state, "number", updated);
      await saveActivationState(id, next);
      return NextResponse.json({ step: updated, error: result.error }, { status: 200 });
    }

    // Link the number to the existing tenant row.
    const { error: linkErr } = await supabaseAdmin
      .from("tenants")
      .update({
        phone_number: result.number,
        vapi_phone_number_id: result.id,
        updated_at: nowIso(),
      })
      .eq("id", prospect.tenant_id);
    if (linkErr) {
      const failedDraft: NumberDraft = { ...step.draft, status: "failed", last_error: linkErr.message };
      const updated = { ...step, draft: failedDraft };
      await saveActivationState(id, setStep(state, "number", updated));
      return NextResponse.json({ step: updated, error: linkErr.message }, { status: 500 });
    }

    const okDraft: NumberDraft = {
      ...step.draft,
      status: "provisioned",
      phone_number: result.number,
      vapi_phone_number_id: result.id,
      last_error: null,
    };
    const updated = { ...step, draft: okDraft, committed_at: nowIso() };
    await saveActivationState(id, setStep(state, "number", updated));
    return NextResponse.json({ step: updated });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
