import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { CHAT_TOOL_DEFINITIONS, runTool, type ToolSource } from "./chat-tools";

/**
 * Staff chat engine — one loop that lets the LLM choose tools, grounded
 * only in the retrieval layer that's strictly tenant-scoped.
 *
 * Deliberately simple:
 *   - One LLM per turn (plus one per tool hop, capped)
 *   - No pre-classification; the model picks what to fetch
 *   - No streaming yet — the UI blocks until a final answer is ready
 *
 * If we want streaming later, wrap the final generation in
 * openai.chat.completions.stream() and keep the tool loop sync.
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "placeholder" });

const MODEL = "gpt-4o";
const MAX_TOOL_HOPS = 4;

export const CHAT_PROMPT_VERSION = "2026-04-21.v1";

const SYSTEM_PROMPT = `You help medspa staff recall context about their clients. You're their colleague, not a clinical assistant.

## How to answer
- Use the tools to pull real data. Never invent facts.
- Answer in warm, conversational prose — like you're briefing a coworker who just walked up to the desk. No bullet lists unless the question explicitly wants a list ("show me all clients who…").
- Cite casually: "from her last call", "per her profile", "per our notes". Don't say "based on the data provided" or reference sources formally.
- Stay concise. A short answer that's right beats a thorough answer that hedges.
- If the material doesn't support an answer, say so plainly: "I don't have anything on that yet" or "she hasn't mentioned that in any calls I've seen". Do not guess.
- Never make medical recommendations. If asked, steer to "that's a conversation for the provider".
- If asked to draft a message to a client, decline — that feature isn't wired up here.

## When to use which tool
- Known client by name or phone → \`get_client_context\`
- Structured filter (time-based, service-based, tag-based) → \`filter_clients\`
- Narrative cross-client question ("who mentioned a wedding") → \`search_clients_by_keyword\`
- A single question may need more than one tool call. That's fine. But don't call tools you don't need.

## Safety
- Only answer questions about clients in the tenant whose data you can see. The retrieval layer enforces this; don't try to reason about or reference clients outside it.`;

export interface ChatTurnRequest {
  tenantId: string;
  /** Prior turns in this conversation, user-facing roles only (user/assistant). Tool turns are NOT passed in — we re-derive them each call. */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** The new user message being answered. */
  message: string;
  /** Optional client the conversation is scoped to — seeds get_client_context. */
  clientProfileId?: string;
}

export interface ChatTurnResult {
  answer: string;
  sources: ToolSource[];
  toolCalls: Array<{ name: string; args: Record<string, unknown>; error?: string }>;
  promptVersion: string;
}

export async function runChatTurn(req: ChatTurnRequest): Promise<ChatTurnResult> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...req.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: req.message },
  ];

  const sources: ToolSource[] = [];
  const toolCalls: ChatTurnResult["toolCalls"] = [];

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      messages,
      tools: CHAT_TOOL_DEFINITIONS,
    });

    const msg = completion.choices[0]?.message;
    if (!msg) break;

    // No tool calls → LLM is ready with the final answer.
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return {
        answer: msg.content?.trim() || "I don't have anything on that yet.",
        sources: dedupeSources(sources),
        toolCalls,
        promptVersion: CHAT_PROMPT_VERSION,
      };
    }

    // Echo the assistant's tool-request turn back into the message list
    // so OpenAI can correlate tool responses.
    messages.push(msg);

    // Run each requested tool. Errors don't abort the loop — we feed the
    // error back to the model so it can decide whether to try a different
    // approach.
    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(call.function.arguments || "{}");
      } catch {
        parsedArgs = {};
      }

      const { result, sources: toolSources, error } = await runTool(
        req.tenantId,
        call.function.name,
        parsedArgs
      );

      toolCalls.push({
        name: call.function.name,
        args: parsedArgs,
        error,
      });
      sources.push(...toolSources);

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(error ? { error } : result),
      });
    }
  }

  // Hit the tool-hop cap. Ask the model one more time with no tools to
  // force a synthesis from whatever it's already fetched.
  const final = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    messages,
  });
  const answer =
    final.choices[0]?.message?.content?.trim() ||
    "I'm having trouble pulling the right data right now — try again in a moment.";

  return {
    answer,
    sources: dedupeSources(sources),
    toolCalls,
    promptVersion: CHAT_PROMPT_VERSION,
  };
}

function dedupeSources(sources: ToolSource[]): ToolSource[] {
  const seen = new Set<string>();
  const out: ToolSource[] = [];
  for (const s of sources) {
    const key = `${s.kind}:${s.clientProfileId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Summarize the first user message into a short conversation title.
 * Runs separately so the main chat response doesn't wait on it.
 */
export async function generateConversationTitle(firstMessage: string): Promise<string> {
  const truncated = firstMessage.slice(0, 200);
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 20,
      messages: [
        {
          role: "system",
          content:
            "Summarize the user's message as a 3-6 word chat title, no quotes, no period. Warm tone.",
        },
        { role: "user", content: truncated },
      ],
    });
    return res.choices[0]?.message?.content?.trim().replace(/['"]/g, "") || truncated.slice(0, 40);
  } catch {
    return truncated.slice(0, 40);
  }
}
