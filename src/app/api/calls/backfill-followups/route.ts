import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

// Backfill follow-up tasks across historical calls.
// Live calls have always relied on Vivienne calling record_followup_task
// during the conversation. Old transcripts that pre-date the tool — or
// where she just didn't invoke it — never produced tasks. This endpoint
// walks the tenant's calls, asks an LLM to extract concrete follow-ups
// from each transcript, and inserts them with source='backfill'.
//
// Idempotent: skips any call that already has followups.
// Bounded: caps how many calls we touch per invocation so a single click
// can't fan out into hundreds of OpenAI requests in one go.

export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "placeholder" });
const MODEL = "gpt-4o-mini"; // cheaper for batch extraction
const MAX_CALLS_PER_RUN = 50;

interface ExtractedTask {
  action: string;
  customer_name?: string | null;
}

export async function POST(req: NextRequest) {
  const tenant = (await getCurrentTenant()) as { id: string; name: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Math.min(
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : MAX_CALLS_PER_RUN,
    MAX_CALLS_PER_RUN
  );

  // Pull recent calls with transcripts. We process newest-first so a
  // partial run still surfaces the most recent missed tasks.
  const { data: callRows } = await supabaseAdmin
    .from("call_logs")
    .select("id, vapi_call_id, caller_number, summary, transcript, created_at")
    .eq("tenant_id", tenant.id)
    .not("transcript", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const calls = (callRows ?? []) as Array<{
    id: string;
    vapi_call_id: string;
    caller_number: string | null;
    summary: string | null;
    transcript: string | null;
    created_at: string;
  }>;

  if (calls.length === 0) {
    return NextResponse.json({ processed: 0, calls_with_tasks: 0, tasks_created: 0 });
  }

  // Skip any call that already carries followups (live, chat, manual,
  // or a previous backfill run). Looked up by both legacy vapi_call_id
  // and call_log_id since older live rows only have the former.
  const callIds = calls.map((c) => c.id);
  const vapiIds = calls.map((c) => c.vapi_call_id).filter(Boolean);
  const filterParts: string[] = [];
  if (vapiIds.length) {
    filterParts.push(`vapi_call_id.in.(${vapiIds.map((v) => `"${v}"`).join(",")})`);
  }
  if (callIds.length) {
    filterParts.push(`call_log_id.in.(${callIds.map((c) => `"${c}"`).join(",")})`);
  }
  const { data: existingFollowups } = filterParts.length
    ? await supabaseAdmin
        .from("call_followups")
        .select("vapi_call_id, call_log_id")
        .eq("tenant_id", tenant.id)
        .or(filterParts.join(","))
    : { data: [] };

  const skipVapi = new Set<string>();
  const skipCallId = new Set<string>();
  for (const f of (existingFollowups ?? []) as Array<{
    vapi_call_id: string | null;
    call_log_id: string | null;
  }>) {
    if (f.vapi_call_id) skipVapi.add(f.vapi_call_id);
    if (f.call_log_id) skipCallId.add(f.call_log_id);
  }

  const toProcess = calls
    .filter((c) => !skipVapi.has(c.vapi_call_id) && !skipCallId.has(c.id))
    .slice(0, limit);

  let callsWithTasks = 0;
  let tasksCreated = 0;
  const errors: Array<{ call_id: string; error: string }> = [];

  for (const c of toProcess) {
    try {
      const tasks = await extractTasks({
        transcript: c.transcript ?? "",
        summary: c.summary ?? "",
      });
      if (tasks.length === 0) continue;

      const inserts = tasks.map((t) => ({
        tenant_id: tenant.id,
        vapi_call_id: c.vapi_call_id,
        call_log_id: c.id,
        customer_phone: c.caller_number,
        customer_name: t.customer_name?.trim() || null,
        action: t.action.trim(),
        source: "backfill" as const,
        status: "pending" as const,
      }));

      const { error: insertErr } = await supabaseAdmin
        .from("call_followups")
        .insert(inserts);
      if (insertErr) {
        errors.push({ call_id: c.id, error: insertErr.message });
        continue;
      }

      callsWithTasks += 1;
      tasksCreated += inserts.length;
    } catch (e) {
      errors.push({
        call_id: c.id,
        error: e instanceof Error ? e.message : "extraction failed",
      });
    }
  }

  return NextResponse.json({
    processed: toProcess.length,
    calls_with_tasks: callsWithTasks,
    tasks_created: tasksCreated,
    skipped_already_have_tasks: calls.length - toProcess.length,
    errors,
  });
}

async function extractTasks(args: {
  transcript: string;
  summary: string;
}): Promise<ExtractedTask[]> {
  const transcript = args.transcript.slice(0, 8000);
  const summary = args.summary.slice(0, 1500);

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are extracting concrete follow-up tasks from a med spa receptionist call transcript.

Return strict JSON: {"tasks": [{"action": "imperative one-liner", "customer_name": "first name if known, else null"}]}

A "task" is a concrete action the clinic team needs to take *after* the call:
- The receptionist promised to text/email/call back ("we'll have someone reach out", "I'll text you the link")
- The caller asked for something the receptionist couldn't provide live (a quote, a brochure, a callback)
- A specific commitment was made ("we'll confirm by Tuesday")

Do NOT include:
- Things the caller did themselves on the call (booked an appointment, asked questions that were fully answered)
- Generic platitudes ("thank you for calling")
- Internal observations

If there are no follow-ups, return {"tasks": []}.

Phrase each action imperatively, like "Text caller HydraFacial pricing" or "Call back about Botox availability for Friday".`,
      },
      {
        role: "user",
        content: `## Summary\n${summary || "(none)"}\n\n## Transcript\n${transcript || "(none)"}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  try {
    const j = JSON.parse(raw) as { tasks?: ExtractedTask[] };
    if (!Array.isArray(j.tasks)) return [];
    return j.tasks
      .filter((t) => t && typeof t.action === "string" && t.action.trim())
      .map((t) => ({
        action: t.action.trim().slice(0, 500),
        customer_name: t.customer_name?.toString().trim() || null,
      }));
  } catch {
    return [];
  }
}
