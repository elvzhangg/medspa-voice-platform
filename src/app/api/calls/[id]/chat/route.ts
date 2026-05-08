import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

// Per-call "Ask Vivienne" chat. Stateless on the server: each request
// receives the full message history plus the call transcript and
// summary, replies with a narrative answer, and may *propose* one or
// more follow-up tasks. Proposed tasks are rendered as confirmable
// cards in the UI; nothing lands in the database until the user clicks
// "Add task" (handled by the sibling /followups POST endpoint). This
// avoids the model silently committing tasks the user didn't authorize.

type Ctx = { params: Promise<{ id: string }> };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "placeholder" });
const MODEL = "gpt-4o";
const MAX_PROPOSED_TASKS = 6;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ProposedTask {
  action: string;
}

interface ChatResponse {
  reply: string;
  proposedTasks: ProposedTask[];
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
  let parsed: ChatResponse = { reply: "", proposedTasks: [] };
  try {
    const j = JSON.parse(raw) as Partial<{
      reply: string;
      proposed_tasks: Array<{ action?: string }>;
    }>;
    const tasks = Array.isArray(j.proposed_tasks)
      ? j.proposed_tasks
          .filter((t) => t && typeof t.action === "string" && t.action.trim())
          .map((t) => ({ action: t.action!.trim().slice(0, 500) }))
          .slice(0, MAX_PROPOSED_TASKS)
      : [];
    parsed = {
      reply: (j.reply ?? "").trim(),
      proposedTasks: tasks,
    };
  } catch {
    parsed = { reply: raw, proposedTasks: [] };
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

# When to propose tasks

Be PROACTIVE about surfacing follow-up tasks. A "task" is a concrete action the clinic team needs to take *after* the call — calling the customer back, texting them info, confirming an appointment, having a provider answer a deferred question, etc.

Propose tasks in any of these situations:

1. **Direct request** — owner says "add a task to X", "remind me to X", "make a note to X". Use their wording. Usually one task.

2. **Indirect signal** — owner asks about an unfulfilled commitment from the call, e.g. "didn't they say staff would reach out?", "weren't we going to text her pricing?", "what about the consultation she wanted?", "this is a task". The fact they're asking means it should be tracked. Answer their question AND propose the task in the same turn.

3. **Audit question** — owner asks open-ended "is there a task here?", "anything to follow up on?", "did we promise anything?", "what did we miss?", "any follow-ups?". Re-read the transcript carefully and propose EVERY uncommitted promise, request, or deferred question you find — up to 6. Do not stop at one.

4. **Question reveals a gap** — even on a regular factual question, if the answer reveals an unfulfilled promise the team should track, propose it alongside your factual answer.

DO NOT propose tasks for things the caller already accomplished on the call (booked an appointment, got a question fully answered) or for general factual questions ("what service did she want?") unless those questions reveal a gap (#4).

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

If the owner asks about follow-ups that are all already on the list, say "Those are already on the task list" and don't propose anything.

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
  "reply": "your conversational reply to the owner — 1-3 sentences, natural and warm. If proposing tasks, give context (e.g. 'I found 3 things she asked about that aren't logged yet.') so they know to look at the confirm cards.",
  "proposed_tasks": [
    { "action": "specific imperative task one" },
    { "action": "specific imperative task two" }
  ]
}

If you have no tasks to propose, return proposed_tasks as an empty array []. The UI shows confirm buttons for each — never claim a task is "added" or "done" yourself; only the user clicking confirm does that.`;
}
