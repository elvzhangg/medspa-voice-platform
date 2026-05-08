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
    .select("id, caller_number, summary, transcript, created_at")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  const systemPrompt = buildSystemPrompt({
    tenantName: tenant.name,
    call: call as CallRow,
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

function buildSystemPrompt(args: { tenantName: string; call: CallRow }): string {
  const { tenantName, call } = args;
  const transcriptExcerpt = (call.transcript ?? "").slice(0, 6000);

  return `You are Vivienne, the AI Clientele Specialist for ${tenantName}. The clinic owner is asking you questions about a specific call. Answer based ONLY on the transcript and summary below — never make up facts that aren't present.

If the owner asks you to add a follow-up task (e.g. "remind me to text her pricing", "add a task to send the HydraFacial menu"), DO NOT confirm it as done. Instead, set propose_task=true and write the task action in task_action — the UI will show a confirmation button. Wait for the owner to confirm. Phrase the task imperatively, like "Text caller HydraFacial pricing" or "Call back at 2pm to confirm appointment".

Only propose a task when the owner clearly asks to create one. Don't propose tasks proactively from general questions.

## Call context
- Caller phone: ${call.caller_number ?? "unknown"}
- Called at: ${new Date(call.created_at).toLocaleString("en-US")}

## Summary
${call.summary ?? "(no summary available)"}

## Transcript
${transcriptExcerpt || "(no transcript available)"}

## Response format (MANDATORY)
Return strict JSON with exactly these keys:
{
  "reply": "your conversational reply to the owner — keep it 1-3 sentences, natural and warm",
  "propose_task": false,
  "task_action": ""
}

When proposing a task, set propose_task=true and fill task_action with the imperative one-line task. The reply should still be conversational, e.g. "Want me to add this as a task?" — the UI will show the confirm button.`;
}
