import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

// Per-call "Ask Vivienne" chat. Stateless on the server: each request
// receives the full message history plus the call transcript and
// summary, replies with a narrative answer, and may *propose* a follow-
// up task. A proposed task is rendered as a confirmable card in the UI;
// nothing lands in the database until the user clicks "Add task" (handled
// by the sibling /followups POST endpoint). This avoids the model
// silently committing tasks the user didn't authorize.

type Ctx = { params: Promise<{ id: string }> };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "placeholder" });
const MODEL = "gpt-4o";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  reply: string;
  proposedTask: { action: string } | null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const tenant = (await getCurrentTenant()) as { id: string; name: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json()) as { messages: ChatMessage[] };
  if (!body.messages?.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const { data: call } = await supabaseAdmin
    .from("call_logs")
    .select("id, vapi_call_id, caller_number, summary, transcript, created_at")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  // Pull existing follow-ups so Vivienne can avoid proposing duplicates of
  // tasks already on the page (live-call rows, prior chat-confirmed, or
  // backfill output). Looked up by both keys for robustness.
  const { data: existing } = await supabaseAdmin
    .from("call_followups")
    .select("action, status")
    .eq("tenant_id", tenant.id)
    .or(
      `call_log_id.eq.${call.id}${call.vapi_call_id ? `,vapi_call_id.eq.${call.vapi_call_id}` : ""}`
    );

  const existingActions = ((existing ?? []) as Array<{ action: string; status: string }>).map(
    (f) => `- ${f.action}${f.status === "done" ? " (done)" : ""}`
  );

  const systemPrompt = buildSystemPrompt({
    tenantName: tenant.name,
    call: call as CallRow,
    existingActions,
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: ChatResponse = { reply: "", proposedTask: null };
  try {
    const j = JSON.parse(raw) as Partial<{
      reply: string;
      propose_task: boolean;
      task_action: string;
    }>;
    parsed = {
      reply: (j.reply ?? "").trim(),
      proposedTask:
        j.propose_task && j.task_action?.trim()
          ? { action: j.task_action.trim() }
          : null,
    };
  } catch {
    parsed = { reply: raw, proposedTask: null };
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
  call: CallRow;
  existingActions: string[];
}): string {
  const { tenantName, call, existingActions } = args;
  const transcriptExcerpt = (call.transcript ?? "").slice(0, 6000);
  const existingBlock = existingActions.length
    ? existingActions.join("\n")
    : "(no tasks logged yet)";

  return `You are Vivienne, the AI Clientele Specialist for ${tenantName}. The clinic owner is asking you about a specific call. Answer based ONLY on the transcript and summary below — never make up facts that aren't present.

# When to propose a task

Be PROACTIVE about surfacing follow-up tasks. A "task" is a concrete action the clinic team needs to take *after* the call — calling the customer back, texting them info, confirming an appointment, having a provider answer a deferred question, etc.

Propose a task (set propose_task=true) in any of these situations:

1. **Direct request** — owner says "add a task to X", "remind me to X", "make a note to X". Use their wording.

2. **Indirect signal** — owner asks about an unfulfilled commitment from the call, e.g. "didn't they say staff would reach out about X?", "weren't we going to text her pricing?", "what about the consultation she wanted?", "this is a task". The fact they're asking means it should be tracked. Answer their question AND propose the task in the same turn.

3. **Question reveals a gap** — owner asks something like "did they want a callback?" or "did we promise anything?", and the transcript shows the receptionist DID promise something that hasn't been logged yet. Surface it.

DO NOT propose tasks for things the caller already accomplished on the call (booked an appointment, got a question fully answered) or for general factual questions ("what service did she want?").

# How to phrase tasks

Tasks must be specific and actionable. Include:
- The caller's first name when known (from the transcript)
- The specific topic, not a vague summary
- The channel if mentioned (text / call back / email)

Bad: "Have staff reach out"
Good: "Call Lillian to discuss sun exposure concerns before her HydraFacial appointment"

Bad: "Follow up about pricing"
Good: "Text Lillian the HydraFacial pricing she asked about"

# Avoid duplicates

Tasks already logged for this call (DO NOT propose anything that overlaps with these — mention them instead):
${existingBlock}

If the owner asks about a follow-up that's already on the list, just say "That's already on the task list" and don't propose it again.

# Call context
- Caller phone: ${call.caller_number ?? "unknown"}
- Called at: ${new Date(call.created_at).toLocaleString("en-US")}

## Summary
${call.summary ?? "(no summary available)"}

## Transcript
${transcriptExcerpt || "(no transcript available)"}

# Response format (MANDATORY)
Return strict JSON with exactly these keys:
{
  "reply": "your conversational reply to the owner — keep it 1-3 sentences, natural and warm. If proposing a task, end with something like 'Want me to add this as a task?' so they know to look at the confirm card.",
  "propose_task": false,
  "task_action": ""
}

When proposing, set propose_task=true and fill task_action with the specific imperative one-liner. The UI shows the confirm button — never claim a task is "added" or "done" yourself; only the user clicking confirm does that.`;
}
