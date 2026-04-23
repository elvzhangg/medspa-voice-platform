import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

// Follow-up Co-Pilot drafter — focused conversation surface where the
// tenant collaborates with Vivienne to write a winback SMS for a caller
// who didn't book. Deliberately simple: no tools, just a drafting loop
// that returns (a) a narration reply to the tenant and (b) the current
// best-draft SMS body. The tenant can iterate until the draft is right,
// then hit Send (separate endpoint) to Twilio it.
//
// TCPA note: the caller is in an established business relationship
// (they called the clinic), so informational SMS is permitted. We still
// require the draft to include "Reply STOP to opt out" — enforced by
// the system prompt and post-processing in the send endpoint.

type Ctx = { params: Promise<{ id: string }> };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "placeholder" });
const MODEL = "gpt-4o";
const MAX_DRAFT_LEN = 480; // ~3 SMS segments

interface DrafterMessage {
  role: "user" | "assistant";
  content: string;
}

interface DraftResponse {
  reply: string;
  draft: string;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const tenant = (await getCurrentTenant()) as {
    id: string;
    name: string;
  } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json()) as {
    messages: DrafterMessage[];
    currentDraft?: string;
  };

  // Load the call + a little caller profile + tenant service/pricing context
  // so the drafter can personalize without being told every detail.
  const [{ data: call }, { data: tenantFull }] = await Promise.all([
    supabaseAdmin
      .from("call_logs")
      .select("id, caller_number, summary, transcript, created_at, tenant_id")
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    supabaseAdmin
      .from("tenants")
      .select("name, booking_config")
      .eq("id", tenant.id)
      .maybeSingle(),
  ]);

  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  let callerProfile: { first_name: string | null; last_name: string | null; last_service: string | null } | null = null;
  if (call.caller_number) {
    const { data: profile } = await supabaseAdmin
      .from("client_profiles")
      .select("first_name, last_name, last_service")
      .eq("tenant_id", tenant.id)
      .eq("phone", call.caller_number)
      .maybeSingle();
    callerProfile = profile as typeof callerProfile;
  }

  const systemPrompt = buildSystemPrompt({
    tenantName: tenantFull?.name ?? tenant.name,
    bookingConfig: (tenantFull?.booking_config ?? {}) as Record<string, unknown>,
    call: call as CallRow,
    callerProfile,
    currentDraft: body.currentDraft ?? "",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: DraftResponse = { reply: "", draft: body.currentDraft ?? "" };
  try {
    const j = JSON.parse(raw) as Partial<DraftResponse>;
    parsed = {
      reply: (j.reply ?? "").trim(),
      draft: (j.draft ?? body.currentDraft ?? "").trim().slice(0, MAX_DRAFT_LEN),
    };
  } catch {
    parsed = { reply: raw, draft: body.currentDraft ?? "" };
  }

  return NextResponse.json(parsed);
}

interface CallRow {
  id: string;
  caller_number: string | null;
  summary: string | null;
  transcript: string | null;
  created_at: string;
}

function buildSystemPrompt(args: {
  tenantName: string;
  bookingConfig: Record<string, unknown>;
  call: CallRow;
  callerProfile: { first_name: string | null; last_name: string | null; last_service: string | null } | null;
  currentDraft: string;
}): string {
  const { tenantName, call, callerProfile, currentDraft } = args;
  const firstName = callerProfile?.first_name ?? inferFirstNameFromSummary(call.summary);
  const transcriptExcerpt = (call.transcript ?? "").slice(0, 3000);

  return `You are Vivienne, the AI receptionist for ${tenantName}. The clinic owner is working with you to draft a personalized SMS follow-up to a caller who didn't book during their call. Your job: converse with the owner and keep refining the draft based on what they tell you.

## Context about the caller
- Phone: ${call.caller_number ?? "unknown"}
- First name (best guess): ${firstName ?? "unknown — address them warmly without using a name"}
- Returning client: ${callerProfile ? "yes — previous service was " + (callerProfile.last_service ?? "unknown") : "no, first-time caller"}
- Called at: ${new Date(call.created_at).toLocaleString("en-US")}

## Call summary
${call.summary ?? "(no summary available)"}

## Transcript excerpt
${transcriptExcerpt || "(no transcript available)"}

## Current draft (from prior turn — update as the owner directs)
${currentDraft || "(no draft yet — write the first version after the owner's first message)"}

## Drafting rules (must follow)
- Keep it under 3 SMS segments (~480 chars total).
- Warm, professional, concise — like a front-desk receptionist texting.
- Always end with exactly this phrase: "Reply STOP to opt out."
- Never include the procedure name as PHI in a way that could leak if intercepted. Prefer "your recent inquiry" or "the treatment we discussed" unless the owner explicitly asks you to name it.
- If the owner tells you to offer a discount, promo, or booking link, include it naturally.
- Never invent prices, dates, or availability you haven't been told. Ask the owner if you need info.
- Sign off with the clinic name: "— ${tenantName}".

## Response format (MANDATORY)
Return strict JSON with exactly two keys:
{
  "reply": "conversational message back to the owner explaining what you did or asking a clarifying question — max 2 sentences",
  "draft": "the current best SMS draft, ready to send as-is"
}

If the owner hasn't given you enough direction to draft yet, ask one short clarifying question in "reply" and leave "draft" as your best guess or the current draft unchanged.`;
}

function inferFirstNameFromSummary(summary: string | null): string | null {
  if (!summary) return null;
  const m = summary.match(/\b([A-Z][a-z]{2,})\b/);
  return m ? m[1] : null;
}
