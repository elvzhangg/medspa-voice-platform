import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { logProspectEvent } from "@/lib/prospect-events";
import { computeConfidence } from "@/lib/prospect-confidence";
import { draftEmailForProspect } from "@/lib/email-drafter";

export const runtime = "nodejs";
export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VAPI_API_KEY = process.env.VAPI_API_KEY!;

function encode(obj: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

// Tools the ops chat can use to modify the prospect and its supporting state.
const TOOLS: Anthropic.Tool[] = [
  {
    name: "update_prospect_field",
    description:
      "Update a single flat field on the prospect. Use for simple corrections like owner_email, phone, booking_platform, services_summary, notes, etc. Do NOT use for procedures/providers/hours — those have dedicated tools.",
    input_schema: {
      type: "object" as const,
      properties: {
        field: {
          type: "string",
          enum: [
            "business_name", "website", "email", "phone", "address",
            "city", "state", "booking_platform",
            "owner_name", "owner_email", "owner_title",
            "services_summary", "pricing_notes", "notes",
          ],
        },
        value: { type: "string", description: "New value, or empty string to clear" },
      },
      required: ["field", "value"],
    },
  },
  {
    name: "replace_procedures",
    description:
      "Replace the entire procedures array. Each item: { name, description?, duration_min?, price?, notes? }. Use when the user gives a complete new list or wants a major reshape. For single additions, fetch the current list first via the transcript context and pass the full updated array.",
    input_schema: {
      type: "object" as const,
      properties: {
        procedures: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              duration_min: { type: "number" },
              price: { type: "string" },
              notes: { type: "string" },
            },
            required: ["name"],
          },
        },
      },
      required: ["procedures"],
    },
  },
  {
    name: "replace_providers",
    description: "Replace the entire providers array with the new list.",
    input_schema: {
      type: "object" as const,
      properties: {
        providers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              title: { type: "string" },
              specialties: { type: "array", items: { type: "string" } },
              bio: { type: "string" },
            },
            required: ["name"],
          },
        },
      },
      required: ["providers"],
    },
  },
  {
    name: "update_hours",
    description:
      "Update hours. Pass an object keyed by lowercase day name (monday..sunday). Values are display strings like '9am–6pm' or 'Closed'. Only keys you pass get updated — others stay as-is. Pass all 7 days if you want a full replacement.",
    input_schema: {
      type: "object" as const,
      properties: {
        hours: {
          type: "object",
          additionalProperties: { type: "string" },
        },
        replace_all: {
          type: "boolean",
          description: "If true, overwrite the entire hours object. If false (default), merge into existing.",
        },
      },
      required: ["hours"],
    },
  },
  {
    name: "add_kb_chunk",
    description:
      "Add a custom knowledge chunk to the demo voice agent's knowledge base. Use for info not captured in the structured fields — e.g. parking instructions, a promotion, a specific policy. Requires the prospect to have a provisioned demo tenant.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        category: {
          type: "string",
          enum: ["services", "pricing", "policies", "faq", "general"],
        },
      },
      required: ["title", "content", "category"],
    },
  },
  {
    name: "regenerate_email",
    description:
      "Trigger the email drafting agent to rewrite the outreach email draft with current data. The existing draft is overwritten and email_approved resets to false for re-review.",
    input_schema: {
      type: "object" as const,
      properties: {
        free_trial_hint: {
          type: "boolean",
          description: "If true, permit mentioning a free trial offer; if false, keep pricing off the email.",
        },
      },
    },
  },
  {
    name: "release_demo",
    description:
      "Release the Vapi demo phone number and delete the demo tenant. Irreversible from the ops side — a new number would need to be bought. Use when the prospect is being archived or the agent needs a clean reprovision.",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: { type: "string", description: "Why you're releasing" },
      },
      required: ["reason"],
    },
  },
];

async function handleToolCall(
  prospect_id: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  const { data: prospect } = await supabaseAdmin
    .from("outreach_prospects")
    .select("*")
    .eq("id", prospect_id)
    .single();

  if (!prospect) return JSON.stringify({ ok: false, error: "Prospect not found" });

  switch (toolName) {
    case "update_prospect_field": {
      const field = String(input.field);
      const value = input.value === "" ? null : String(input.value);
      await supabaseAdmin
        .from("outreach_prospects")
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq("id", prospect_id);
      await logProspectEvent({
        prospect_id,
        event_type: "note_added",
        summary: `Ops chat: set ${field} → ${value ?? "null"}`,
        payload: { field, value },
        actor: "agent:ops-chat",
      });
      return JSON.stringify({ ok: true, updated: { [field]: value } });
    }

    case "replace_procedures": {
      const procedures = input.procedures;
      const confidence = computeConfidence({ ...prospect, procedures: procedures as Array<{ name?: string; price?: string | number }> });
      await supabaseAdmin
        .from("outreach_prospects")
        .update({
          procedures,
          research_confidence: confidence.score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", prospect_id);
      await logProspectEvent({
        prospect_id,
        event_type: "note_added",
        summary: `Ops chat: procedures replaced (${Array.isArray(procedures) ? procedures.length : 0} entries, confidence now ${Math.round(confidence.score * 100)}%)`,
        actor: "agent:ops-chat",
      });
      return JSON.stringify({ ok: true, count: Array.isArray(procedures) ? procedures.length : 0, new_confidence: confidence.score });
    }

    case "replace_providers": {
      const providers = input.providers;
      const confidence = computeConfidence({ ...prospect, providers: providers as Array<{ name?: string }> });
      await supabaseAdmin
        .from("outreach_prospects")
        .update({
          providers,
          research_confidence: confidence.score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", prospect_id);
      await logProspectEvent({
        prospect_id,
        event_type: "note_added",
        summary: `Ops chat: providers replaced (${Array.isArray(providers) ? providers.length : 0} entries)`,
        actor: "agent:ops-chat",
      });
      return JSON.stringify({ ok: true, count: Array.isArray(providers) ? providers.length : 0 });
    }

    case "update_hours": {
      const incoming = (input.hours ?? {}) as Record<string, string>;
      const replaceAll = input.replace_all === true;
      const merged = replaceAll ? incoming : { ...(prospect.hours ?? {}), ...incoming };
      const confidence = computeConfidence({ ...prospect, hours: merged });
      await supabaseAdmin
        .from("outreach_prospects")
        .update({
          hours: merged,
          research_confidence: confidence.score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", prospect_id);
      await logProspectEvent({
        prospect_id,
        event_type: "note_added",
        summary: `Ops chat: hours ${replaceAll ? "replaced" : "merged"}`,
        actor: "agent:ops-chat",
      });
      return JSON.stringify({ ok: true, hours: merged });
    }

    case "add_kb_chunk": {
      if (!prospect.demo_tenant_id) {
        return JSON.stringify({ ok: false, error: "No demo tenant — provision one first" });
      }
      if (!process.env.OPENAI_API_KEY) {
        return JSON.stringify({ ok: false, error: "OPENAI_API_KEY not set — can't embed" });
      }
      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const embRes = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: String(input.content),
        });
        await supabaseAdmin.from("knowledge_base_documents").insert({
          tenant_id: prospect.demo_tenant_id,
          title: String(input.title),
          content: String(input.content),
          category: String(input.category),
          embedding: embRes.data[0].embedding,
        });
        await logProspectEvent({
          prospect_id,
          event_type: "note_added",
          summary: `Ops chat: added KB chunk "${input.title}"`,
          actor: "agent:ops-chat",
        });
        return JSON.stringify({ ok: true, title: input.title });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    case "regenerate_email": {
      const freeTrialHint = input.free_trial_hint === true;
      const result = await draftEmailForProspect(prospect_id, { free_trial_hint: freeTrialHint });
      if (!result.ok) return JSON.stringify({ ok: false, error: result.error });
      return JSON.stringify({ ok: true, subject: result.subject });
    }

    case "release_demo": {
      if (!prospect.demo_tenant_id) return JSON.stringify({ ok: false, error: "No demo tenant to release" });

      const { data: tenant } = await supabaseAdmin
        .from("tenants")
        .select("vapi_phone_number_id, phone_number")
        .eq("id", prospect.demo_tenant_id)
        .single();

      let vapiReleased = false;
      if (tenant?.vapi_phone_number_id && VAPI_API_KEY) {
        try {
          const res = await fetch(`https://api.vapi.ai/phone-number/${tenant.vapi_phone_number_id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
          });
          vapiReleased = res.ok;
        } catch (err) {
          console.error("Vapi release failed:", err);
        }
      }

      await supabaseAdmin.from("tenants").delete().eq("id", prospect.demo_tenant_id);
      await supabaseAdmin
        .from("outreach_prospects")
        .update({
          demo_tenant_id: null,
          demo_provisioned_at: null,
          assigned_demo_number: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", prospect_id);

      await logProspectEvent({
        prospect_id,
        event_type: "demo_released",
        summary: `Ops chat: released demo ${tenant?.phone_number ?? ""} — ${input.reason ?? "no reason given"}`,
        payload: { vapi_released: vapiReleased, reason: input.reason },
        actor: "agent:ops-chat",
      });

      return JSON.stringify({ ok: true, released_number: tenant?.phone_number, vapi_released: vapiReleased });
    }

    default:
      return JSON.stringify({ ok: false, error: `Unknown tool: ${toolName}` });
  }
}

function buildSystemPrompt(prospect: Record<string, unknown>): string {
  const procCount = Array.isArray(prospect.procedures) ? (prospect.procedures as unknown[]).length : 0;
  const provCount = Array.isArray(prospect.providers) ? (prospect.providers as unknown[]).length : 0;
  const confidence = computeConfidence(prospect);

  return `You are the VauxVoice Ops Assistant — a backend agent that helps the internal team manage a specific med spa prospect. Your job is to make requested changes to the prospect's data, regenerate outreach artifacts, and answer questions about them.

You are NOT talking to a customer. You're talking to a VauxVoice team member who is reviewing or editing this prospect. Be direct, terse, and technical. No fluff, no apologies, no sales language.

Current prospect context:
- Business: ${prospect.business_name}
- Location: ${[prospect.city, prospect.state].filter(Boolean).join(", ") || "unknown"}
- Website: ${prospect.website ?? "none"}
- Owner: ${prospect.owner_name ?? "unknown"}${prospect.owner_email ? ` <${prospect.owner_email}>` : ""}
- Booking platform: ${prospect.booking_platform ?? "unknown"}
- Procedures: ${procCount} entries
- Providers: ${provCount} entries
- Current data completeness: ${Math.round(confidence.score * 100)}%
- Missing fields: ${confidence.missing.join(", ") || "none"}
- Demo tenant: ${prospect.demo_tenant_id ? `provisioned at ${prospect.assigned_demo_number}` : "not provisioned"}
- Email draft: ${prospect.email_draft_subject ? `exists ("${prospect.email_draft_subject}")` : "none"}
- Email sent: ${prospect.email_sent_at ? "yes" : "no"}

Rules:
- When the user asks for edits (add this procedure, fix this email, change the owner), use the appropriate tool. Don't describe — do.
- For partial edits to arrays (procedures, providers), reason about the full updated list and pass it to the replace tool.
- After edits, if they meaningfully change content, OFFER to regenerate the email (but don't regenerate unprompted unless the user clearly asks).
- Never make up data. If the user says "their Botox price is $14", trust them. If they ask "what's the Botox price?" pull it from the context above, don't guess.
- Confirm destructive actions (release_demo) briefly before running.
- Be terse. One-liner responses are fine.`;
}

export async function POST(req: NextRequest) {
  const { prospect_id, message } = (await req.json()) as {
    prospect_id?: string;
    message?: string;
  };

  if (!prospect_id || !message) {
    return new Response("prospect_id and message required", { status: 400 });
  }

  // Load prospect for system prompt + tool handlers
  const { data: prospect } = await supabaseAdmin
    .from("outreach_prospects")
    .select("*")
    .eq("id", prospect_id)
    .single();

  if (!prospect) return new Response("Prospect not found", { status: 404 });

  // Load recent chat history (last 30 messages — enough context, won't blow tokens)
  const { data: history } = await supabaseAdmin
    .from("prospect_chat_messages")
    .select("role, content, tool_calls, tool_results")
    .eq("prospect_id", prospect_id)
    .order("created_at", { ascending: true })
    .limit(30);

  // Persist the new user message
  await supabaseAdmin.from("prospect_chat_messages").insert({
    prospect_id,
    role: "user",
    content: message,
    actor: "user",
  });

  // Rebuild Anthropic-format messages from history
  const messages: Anthropic.MessageParam[] = [];
  for (const row of history ?? []) {
    if (row.role === "user") {
      messages.push({ role: "user", content: String(row.content ?? "") });
    } else if (row.role === "assistant") {
      // Reconstruct content blocks: text + any tool_use blocks
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (row.content) blocks.push({ type: "text", text: String(row.content) });
      if (row.tool_calls && Array.isArray(row.tool_calls)) {
        for (const tc of row.tool_calls as Array<{ id: string; name: string; input: Record<string, unknown> }>) {
          blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
        }
      }
      if (blocks.length) messages.push({ role: "assistant", content: blocks });
    } else if (row.role === "tool") {
      // Tool results are packaged as user-role messages per Anthropic schema
      if (row.tool_results && Array.isArray(row.tool_results)) {
        const tr = row.tool_results as Array<{ tool_use_id: string; content: string }>;
        messages.push({
          role: "user",
          content: tr.map((r) => ({ type: "tool_result" as const, tool_use_id: r.tool_use_id, content: r.content })),
        });
      }
    }
  }
  messages.push({ role: "user", content: message });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encode(obj));

      try {
        let continueLoop = true;
        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 4000,
            system: buildSystemPrompt(prospect),
            tools: TOOLS,
            messages,
          });

          // Extract text + tool_use blocks
          const toolUses: Anthropic.ToolUseBlock[] = [];
          let assistantText = "";
          for (const block of response.content) {
            if (block.type === "text") {
              assistantText += block.text;
              if (block.text.trim()) send({ type: "text", text: block.text });
            } else if (block.type === "tool_use") {
              toolUses.push(block);
              send({ type: "tool_call", name: block.name, input: block.input });
            }
          }

          // Persist the assistant message (with any tool calls)
          await supabaseAdmin.from("prospect_chat_messages").insert({
            prospect_id,
            role: "assistant",
            content: assistantText || null,
            tool_calls: toolUses.length
              ? toolUses.map((t) => ({ id: t.id, name: t.name, input: t.input }))
              : null,
            actor: "agent:ops-chat",
          });

          messages.push({ role: "assistant", content: response.content as unknown as Anthropic.ContentBlockParam[] });

          if (response.stop_reason === "end_turn" || toolUses.length === 0) {
            continueLoop = false;
            break;
          }

          // Execute tools, collect results
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          const persistedResults: Array<{ tool_use_id: string; content: string }> = [];
          for (const tu of toolUses) {
            const result = await handleToolCall(prospect_id, tu.name, tu.input as Record<string, unknown>);
            send({ type: "tool_result", name: tu.name, result });
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
            persistedResults.push({ tool_use_id: tu.id, content: result });
          }

          // Persist tool results as a single row
          await supabaseAdmin.from("prospect_chat_messages").insert({
            prospect_id,
            role: "tool",
            tool_results: persistedResults,
            actor: "agent:ops-chat",
          });

          messages.push({ role: "user", content: toolResults });
        }

        send({ type: "done" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// GET: fetch chat history for rendering
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const prospect_id = searchParams.get("prospect_id");
  if (!prospect_id) return new Response("prospect_id required", { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("prospect_chat_messages")
    .select("*")
    .eq("prospect_id", prospect_id)
    .order("created_at", { ascending: true });

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ messages: data ?? [] });
}
