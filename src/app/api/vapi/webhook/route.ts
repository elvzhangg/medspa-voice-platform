import { NextRequest, NextResponse } from "next/server";
import { getTenantByPhoneNumber, getTenantByVapiPhoneNumberId } from "@/lib/tenants";
import { buildAssistantConfig } from "@/lib/assistant-builder";
import { searchKnowledgeBase, formatKBContext } from "@/lib/knowledge-base";

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log("WEBHOOK_RAW:", JSON.stringify(body).slice(0, 2000));

  const message = body.message as Record<string, unknown> | undefined;
  if (!message) return NextResponse.json({ error: "No message" }, { status: 400 });

  const type = message.type as string;

  switch (type) {
    case "assistant-request":
      return handleAssistantRequest(message);
    case "tool-calls":
    case "function-call":
      return handleToolCalls(body, message);
    case "end-of-call-report":
      return NextResponse.json({ received: true });
    default:
      return NextResponse.json({ received: true });
  }
}

async function handleAssistantRequest(message: Record<string, unknown>) {
  const call = message.call as Record<string, unknown> | undefined;
  const phoneNumberId = call?.phoneNumberId as string | undefined;
  const phoneNumberObj = call?.phoneNumber as Record<string, unknown> | undefined;
  const dialedNumber = phoneNumberObj?.number as string | undefined;

  let tenant = phoneNumberId ? await getTenantByVapiPhoneNumberId(phoneNumberId) : null;
  if (!tenant && dialedNumber) tenant = await getTenantByPhoneNumber(dialedNumber);

  if (!tenant) {
    return NextResponse.json({
      assistant: {
        name: "AI Receptionist",
        model: {
          provider: "openai", model: "gpt-4o-mini",
          messages: [{ role: "system", content: "You are a receptionist. There's a technical issue." }],
        },
        voice: { provider: "11labs", voiceId: "EXAVITQu4vr4xnSDxMaL" },
        firstMessage: "Thank you for calling. We're having a brief issue. Could I take your name and number?",
      },
    });
  }

  const callerNumber = (call?.customer as Record<string, unknown> | undefined)?.number as string | undefined;
  const assistant = await buildAssistantConfig(tenant, callerNumber);
  return NextResponse.json({ assistant });
}

interface ParsedToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

/**
 * Parse tool calls from ANY Vapi format.
 * Vapi sends different structures depending on context:
 * 1. toolWithToolCallList: [{toolCall: {id, function: {name, arguments}}, ...}]
 * 2. toolCalls: [{id, function: {name, arguments}}]
 * 3. toolCallList: [{id, name, parameters}] or [{id, function: {name, arguments}}]
 * 
 * Can appear at message level OR at top body level.
 */
/**
 * Safely parse arguments which can be either a JSON string OR already an object
 */
function parseArgs(args: unknown): Record<string, unknown> {
  if (!args) return {};
  if (typeof args === "object") return args as Record<string, unknown>;
  if (typeof args === "string") {
    try { return JSON.parse(args); } catch { return {}; }
  }
  return {};
}

function parseToolCalls(body: Record<string, unknown>, message: Record<string, unknown>): ParsedToolCall[] {
  const sources = [body, message];

  for (const src of sources) {
    // Format 1: toolWithToolCallList
    if (src.toolWithToolCallList && Array.isArray(src.toolWithToolCallList)) {
      const raw = src.toolWithToolCallList as Array<Record<string, unknown>>;
      const parsed = raw.map((item) => {
        const tc = (item.toolCall || item) as Record<string, unknown>;
        const fn = tc.function as { name: string; arguments: unknown } | undefined;
        return {
          id: (tc.id as string) || "",
          name: fn?.name || (tc.name as string) || "",
          parameters: parseArgs(fn?.arguments) || (tc.parameters as Record<string, unknown>) || {},
        };
      });
      if (parsed.length > 0 && parsed[0].name) {
        console.log("PARSED_FROM: toolWithToolCallList", JSON.stringify(parsed));
        return parsed;
      }
    }

    // Format 2: toolCalls
    if (src.toolCalls && Array.isArray(src.toolCalls)) {
      const raw = src.toolCalls as Array<Record<string, unknown>>;
      const parsed = raw.map((tc) => {
        const fn = tc.function as { name: string; arguments: unknown } | undefined;
        return {
          id: (tc.id as string) || "",
          name: fn?.name || (tc.name as string) || "",
          parameters: parseArgs(fn?.arguments) || (tc.parameters as Record<string, unknown>) || {},
        };
      });
      if (parsed.length > 0 && parsed[0].name) {
        console.log("PARSED_FROM: toolCalls", JSON.stringify(parsed));
        return parsed;
      }
    }

    // Format 3: toolCallList
    if (src.toolCallList && Array.isArray(src.toolCallList)) {
      const raw = src.toolCallList as Array<Record<string, unknown>>;
      const parsed = raw.map((tc) => {
        const fn = tc.function as { name: string; arguments: unknown } | undefined;
        return {
          id: (tc.id as string) || "",
          name: fn?.name || (tc.name as string) || "",
          parameters: parseArgs(fn?.arguments) || (tc.parameters as Record<string, unknown>) || {},
        };
      });
      if (parsed.length > 0 && parsed[0].name) {
        console.log("PARSED_FROM: toolCallList", JSON.stringify(parsed));
        return parsed;
      }
    }
  }

  return [];
}

async function handleToolCalls(body: Record<string, unknown>, message: Record<string, unknown>) {
  const call = message.call as Record<string, unknown> | undefined;

  const toolList = parseToolCalls(body, message);
  console.log("TOOL_LIST_FINAL:", JSON.stringify(toolList));

  if (toolList.length === 0) {
    console.error("NO_TOOLS_FOUND. body keys:", Object.keys(body), "message keys:", Object.keys(message));
    return NextResponse.json({ results: [] });
  }

  // Tenant lookup
  const phoneNumberId = call?.phoneNumberId as string | undefined;
  const phoneNumberObj = call?.phoneNumber as Record<string, unknown> | undefined;
  const dialedNumber = phoneNumberObj?.number as string | undefined;
  let tenant = phoneNumberId ? await getTenantByVapiPhoneNumberId(phoneNumberId) : null;
  if (!tenant && dialedNumber) tenant = await getTenantByPhoneNumber(dialedNumber);

  const results = await Promise.all(
    toolList.map(async (toolCall) => {
      console.log("EXEC_TOOL:", toolCall.name, JSON.stringify(toolCall.parameters));

      let result = "";

      switch (toolCall.name) {
        case "search_knowledge_base": {
          if (!tenant) {
            result = "Sorry, I couldn't access our information system right now.";
            break;
          }
          const query = toolCall.parameters.query as string;
          const docs = await searchKnowledgeBase(tenant.id, query, 4);
          console.log("KB_RESULTS:", docs.length);
          result = formatKBContext(docs) || "I couldn't find that information. Let me connect you with our team.";
          break;
        }

        case "book_appointment": {
          const { service, preferred_date, preferred_time, customer_name, customer_phone } =
            toolCall.parameters as Record<string, string>;
          result = `I've noted your request for ${service}${preferred_date ? ` on ${preferred_date}` : ""}${preferred_time ? ` at ${preferred_time}` : ""}. Our team will call ${customer_phone} to confirm within 24 hours.`;
          break;
        }

        default:
          console.error("UNKNOWN_TOOL:", JSON.stringify(toolCall));
          result = "Tool not recognized: " + toolCall.name;
      }

      return { toolCallId: toolCall.id, result };
    })
  );

  return NextResponse.json({ results });
}
