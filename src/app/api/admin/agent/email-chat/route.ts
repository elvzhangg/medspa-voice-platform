import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { buildProspectBrief, buildEmailSystemPrompt } from "@/lib/email-drafter";
import { logProspectEvent } from "@/lib/prospect-events";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface Body {
  prospect_id?: string;
  message?: string;
  history?: ChatTurn[];
  free_trial_hint?: boolean;
}

// Single tool the editor uses to commit a revised draft. Structured output
// guarantees we always get a usable subject/body back even if the model
// would otherwise want to chat freely. The reply_to_user field carries the
// conversational explanation that shows up in the chat panel.
const SAVE_DRAFT_TOOL: Anthropic.Tool = {
  name: "save_draft",
  description:
    "Save a new version of the outbound email draft. Use this every turn — every reply must result in a saved draft, even if the user is just asking a question (in which case keep the draft unchanged and explain your reasoning in reply_to_user).",
  input_schema: {
    type: "object",
    properties: {
      subject:       { type: "string", description: "Email subject line, under 55 chars." },
      body:          { type: "string", description: "Email body, plain text, under 180 words." },
      reply_to_user: { type: "string", description: "A one-or-two-sentence note to the operator explaining what changed in this revision (or why nothing changed, if they asked a question)." },
    },
    required: ["subject", "body", "reply_to_user"],
    additionalProperties: false,
  },
};

export async function POST(req: NextRequest) {
  const { prospect_id, message, history = [], free_trial_hint } = (await req.json().catch(() => ({}))) as Body;

  if (!prospect_id || !message?.trim()) {
    return NextResponse.json({ error: "prospect_id and message required" }, { status: 400 });
  }

  const { data: prospect, error } = await supabaseAdmin
    .from("outreach_prospects")
    .select("*")
    .eq("id", prospect_id)
    .single();
  if (error || !prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const demoNumber: string | null = prospect.assigned_demo_number ?? null;
  const recipientName = prospect.owner_name ? String(prospect.owner_name).split(/\s+/)[0] : null;
  const recipientLine = recipientName ? `Hi ${recipientName},` : "Hi there,";

  const brief = buildProspectBrief(prospect);
  const systemPrompt = buildEmailSystemPrompt(prospect, { free_trial_hint }) +
    `\n\nYou are now in revision mode. The operator may ask you to change the draft, tighten phrasing, change tone, swap concrete details, etc. Always call save_draft with the FULL updated subject and body — never return partial diffs. If the operator is just asking a question rather than asking for a change, call save_draft with the current draft unchanged and put your answer in reply_to_user.`;

  const currentDraft = {
    subject: prospect.email_draft_subject ?? null,
    body: prospect.email_draft_body ?? null,
  };

  // Build context message that the model sees as the FIRST user turn — so
  // every revision turn starts from the same factual ground. The actual
  // conversation history follows after.
  const groundingMessage =
    `Prospect brief:\n${brief}\n\n` +
    (demoNumber ? `Demo number for this prospect (trained on their data): ${demoNumber}\n` : `Note: demo number has NOT been provisioned yet. Omit the call-to-call CTA and instead invite a reply to set up a live demo.\n`) +
    `\nRecipient salutation: ${recipientLine}\n\n` +
    (currentDraft.subject && currentDraft.body
      ? `Current draft:\nSubject: ${currentDraft.subject}\n\n${currentDraft.body}`
      : `No draft yet — write the first version, taking the operator's instructions below into account.`);

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: groundingMessage },
  ];
  // The first assistant turn (if any history exists) confirms the grounding —
  // we synthesize one so Anthropic's alternating-role requirement is met.
  if (history.length > 0) {
    messages.push({ role: "assistant", content: "Understood. I have the brief and current draft. What would you like to change?" });
    for (const turn of history) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }
  // The new operator turn.
  messages.push({ role: "user", content: message.trim() });

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: systemPrompt,
      tools: [SAVE_DRAFT_TOOL],
      tool_choice: { type: "tool", name: SAVE_DRAFT_TOOL.name },
      messages,
    });
  } catch (err) {
    return NextResponse.json({ error: `Model call failed: ${(err as Error).message}` }, { status: 500 });
  }

  const toolUse = response.content.find((c) => c.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  if (!toolUse) {
    return NextResponse.json({ error: "Model did not produce a draft" }, { status: 502 });
  }
  const input = toolUse.input as { subject?: string; body?: string; reply_to_user?: string };
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  const reply = (input.reply_to_user ?? "").trim();
  if (!subject || !body) {
    return NextResponse.json({ error: "Draft missing subject or body" }, { status: 502 });
  }

  // Only write if anything actually changed — keeps the timeline clean of
  // no-op revisions when the operator was just asking a question.
  const changed = subject !== currentDraft.subject || body !== currentDraft.body;
  if (changed) {
    const { error: updateErr } = await supabaseAdmin
      .from("outreach_prospects")
      .update({
        email_draft_subject: subject,
        email_draft_body: body,
        // Revising a draft un-approves it so the operator has to re-confirm
        // before sending. Mirrors the same invariant as the one-shot drafter.
        email_approved: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prospect_id);
    if (updateErr) {
      return NextResponse.json({ error: `Save failed: ${updateErr.message}` }, { status: 500 });
    }
    await logProspectEvent({
      prospect_id,
      event_type: "email_drafted",
      summary: `Revised via chat: "${subject}"`,
      actor: "agent:email-chat",
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    subject,
    body,
    reply,
    changed,
  });
}
