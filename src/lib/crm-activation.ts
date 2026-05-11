import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "./supabase";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Single Claude model used across all activation step chats. Keeping it in one
// place so we can swap globally.
const CHAT_MODEL = "claude-opus-4-6";

export type StepKey = "tenant" | "number" | "knowledge" | "email";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  at: string;
}

export interface TenantDraft {
  name: string;
  slug: string;
  greeting_message: string;
  voice_id: string;
}

// `area_code` is the next code we'll TRY on commit; status reflects the most
// recent commit attempt. "pending" means we haven't tried yet; "failed" lets
// the user revise area code or click Retry.
export interface NumberDraft {
  area_code: string | null;
  status: "pending" | "provisioned" | "failed";
  phone_number?: string | null;
  vapi_phone_number_id?: string | null;
  last_error?: string | null;
}

export interface KnowledgeChunk {
  title: string;
  content: string;
  category: "services" | "pricing" | "policies" | "faq" | "general";
}

export interface KnowledgeDraft {
  chunks: KnowledgeChunk[];
  warnings?: string[];
}

export interface EmailDraft {
  subject: string;
  body: string;
}

export interface StepState<T> {
  draft: T | null;
  chat: ChatTurn[];
  committed_at?: string | null;
  // Knowledge/email-only outcomes
  chunks_inserted?: number;
  sent_at?: string | null;
  sent_to?: string | null;
}

export interface ActivationState {
  tenant?: StepState<TenantDraft>;
  number?: StepState<NumberDraft>;
  knowledge?: StepState<KnowledgeDraft>;
  email?: StepState<EmailDraft>;
}

export async function loadProspect(id: string): Promise<Record<string, unknown> | null> {
  const { data } = await supabaseAdmin
    .from("crm_prospects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export async function saveActivationState(
  prospect_id: string,
  state: ActivationState
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("crm_prospects")
    .update({ activation_state: state, updated_at: new Date().toISOString() })
    .eq("id", prospect_id);
  if (error) throw new Error(`Failed to save activation_state: ${error.message}`);
}

export function getStep<T>(state: ActivationState, key: StepKey): StepState<T> {
  // Cast through unknown — each key has its own draft type, but for shared
  // helpers we treat them generically.
  return ((state as unknown as Record<StepKey, StepState<T> | undefined>)[key]) ?? { draft: null, chat: [] };
}

export function setStep<T>(state: ActivationState, key: StepKey, step: StepState<T>): ActivationState {
  return { ...state, [key]: step } as ActivationState;
}

export function appendTurns<T>(step: StepState<T>, turns: ChatTurn[]): StepState<T> {
  return { ...step, chat: [...step.chat, ...turns] };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function areaCodeFrom(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const stripped = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  return stripped.length >= 3 ? stripped.slice(0, 3) : null;
}

/**
 * Calls Claude with a per-step system prompt + the conversation so far + the
 * user's new message, asking it to return a revised draft (same shape as the
 * input) plus a short reply explaining what it changed. The model is told to
 * respond with strict JSON: `{ "reply": "...", "draft": {...} }`.
 *
 * If the user says something the agent can't act on (e.g. asks a question),
 * `draft` is returned unchanged.
 */
export async function reviseWithChat<T>(args: {
  systemPrompt: string;
  currentDraft: T;
  history: ChatTurn[];
  userMessage: string;
}): Promise<{ revised: T; reply: string }> {
  const { systemPrompt, currentDraft, history, userMessage } = args;

  const messages: { role: "user" | "assistant"; content: string }[] = [];
  // Seed the conversation with the current draft so the model always sees what
  // it's revising — Anthropic conversation must alternate user→assistant.
  messages.push({
    role: "user",
    content: `Current draft (JSON):\n${JSON.stringify(currentDraft, null, 2)}\n\nReply "ok, ready" if you understand.`,
  });
  messages.push({ role: "assistant", content: "ok, ready" });
  for (const t of history) messages.push({ role: t.role, content: t.content });
  messages.push({
    role: "user",
    content: `${userMessage}\n\nRespond with JSON only: {"reply": "<one-or-two-sentence summary of changes>", "draft": <revised draft, same shape as before — return the full object, not a patch>}.`,
  });

  const res = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages,
  });

  let text = "";
  for (const block of res.content) {
    if (block.type === "text") text += block.text;
  }

  // Pull the first balanced JSON object out of the response.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Model returned no JSON. Raw: ${text.slice(0, 500)}`);
  let parsed: { reply?: string; draft?: T };
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    throw new Error(`Failed to parse model JSON: ${(e as Error).message}. Raw: ${text.slice(0, 500)}`);
  }

  return {
    revised: (parsed.draft ?? currentDraft) as T,
    reply: String(parsed.reply ?? "(no reply)").trim(),
  };
}
