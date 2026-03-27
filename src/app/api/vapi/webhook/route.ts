import { NextRequest, NextResponse } from "next/server";
import { getTenantByPhoneNumber, getTenantByVapiPhoneNumberId } from "@/lib/tenants";
import { buildAssistantConfig } from "@/lib/assistant-builder";
import { searchKnowledgeBase, formatKBContext } from "@/lib/knowledge-base";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Log the FULL raw payload for debugging
  console.log("VAPI_WEBHOOK_RAW:", JSON.stringify(body));

  const message = body.message as Record<string, unknown> | undefined;
  if (!message) {
    return NextResponse.json({ error: "No message" }, { status: 400 });
  }

  const type = message.type as string;
  console.log("VAPI_WEBHOOK_TYPE:", type);

  switch (type) {
    case "assistant-request":
      return handleAssistantRequest(message);
    case "tool-calls":
    case "function-call":
      return handleToolCalls(message);
    case "end-of-call-report":
      return NextResponse.json({ received: true });
    default:
      console.log("VAPI_WEBHOOK_UNHANDLED:", type);
      return NextResponse.json({ received: true });
  }
}

async function handleAssistantRequest(message: Record<string, unknown>) {
  const call = message.call as Record<string, unknown> | undefined;
  const phoneNumberId = call?.phoneNumberId as string | undefined;
  const phoneNumberObj = call?.phoneNumber as Record<string, unknown> | undefined;
  const dialedNumber = phoneNumberObj?.number as string | undefined;

  let tenant = phoneNumberId ? await getTenantByVapiPhoneNumberId(phoneNumberId) : null;
  if (!tenant && dialedNumber) {
    tenant = await getTenantByPhoneNumber(dialedNumber);
  }

  if (!tenant) {
    return NextResponse.json({
      assistant: {
        name: "AI Receptionist",
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: "You are a receptionist. There's a technical issue. Ask the caller to try again." }],
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

async function handleToolCalls(message: Record<string, unknown>) {
  const call = message.call as Record<string, unknown> | undefined;

  // Log all possible tool call fields
  console.log("TOOL_CALLS_KEYS:", Object.keys(message));
  console.log("TOOL_CALLS_toolCallList:", JSON.stringify(message.toolCallList)?.slice(0, 500));
  console.log("TOOL_CALLS_toolCalls:", JSON.stringify(message.toolCalls)?.slice(0, 500));
  console.log("TOOL_CALLS_toolWithToolCallList:", JSON.stringify(message.toolWithToolCallList)?.slice(0, 500));
  console.log("TOOL_CALLS_functionCall:", JSON.stringify(message.functionCall)?.slice(0, 500));

  // Parse tool calls from any of the possible formats
  interface ParsedToolCall {
    id: string;
    name: string;
    parameters: Record<string, unknown>;
  }

  let toolList: ParsedToolCall[] = [];

  if (message.toolCallList) {
    const raw = message.toolCallList as Array<Record<string, unknown>>;
    toolList = raw.map((tc) => ({
      id: (tc.id as string) || "",
      name: (tc.name as string) || "",
      parameters: (tc.parameters as Record<string, unknown>) || {},
    }));
  } else if (message.toolCalls) {
    const raw = message.toolCalls as Array<Record<string, unknown>>;
    toolList = raw.map((tc) => {
      const fn = tc.function as { name: string; arguments: string } | undefined;
      return {
        id: (tc.id as string) || "",
        name: fn?.name || "",
        parameters: (() => { try { return JSON.parse(fn?.arguments || "{}"); } catch { return {}; } })(),
      };
    });
  } else if (message.toolWithToolCallList) {
    const raw = message.toolWithToolCallList as Array<Record<string, unknown>>;
    toolList = raw.map((item) => {
      const tc = item.toolCall as { id: string; function: { name: string; arguments: string } };
      return {
        id: tc.id || "",
        name: tc.function?.name || "",
        parameters: (() => { try { return JSON.parse(tc.function?.arguments || "{}"); } catch { return {}; } })(),
      };
    });
  } else if (message.functionCall) {
    // Legacy single function call format
    const fc = message.functionCall as { name: string; parameters: Record<string, unknown> };
    toolList = [{ id: "fc", name: fc.name, parameters: fc.parameters || {} }];
  }

  console.log("TOOL_CALLS_PARSED:", JSON.stringify(toolList));

  if (toolList.length === 0) {
    console.error("TOOL_CALLS_EMPTY: no tool calls found");
    return NextResponse.json({ results: [] });
  }

  // Tenant lookup
  const phoneNumberId = call?.phoneNumberId as string | undefined;
  const phoneNumberObj = call?.phoneNumber as Record<string, unknown> | undefined;
  const dialedNumber = phoneNumberObj?.number as string | undefined;
  let tenant = phoneNumberId ? await getTenantByVapiPhoneNumberId(phoneNumberId) : null;
  if (!tenant && dialedNumber) tenant = await getTenantByPhoneNumber(dialedNumber);

  console.log("TOOL_CALLS_TENANT:", tenant?.id, tenant?.name);

  const results = await Promise.all(
    toolList.map(async (toolCall) => {
      console.log("TOOL_CALL_EXEC:", toolCall.name, JSON.stringify(toolCall.parameters));

      let result = "";

      switch (toolCall.name) {
        case "search_knowledge_base": {
          if (!tenant) {
            result = "Sorry, I couldn't access our information system right now.";
            break;
          }
          const query = toolCall.parameters.query as string;
          console.log("KB_SEARCH:", tenant.id, query);
          const docs = await searchKnowledgeBase(tenant.id, query, 4);
          console.log("KB_RESULTS:", docs.length, "docs found");
          result = formatKBContext(docs) || "I couldn't find specific information about that. Let me connect you with our team.";
          break;
        }

        case "book_appointment": {
          const { service, preferred_date, preferred_time, customer_name, customer_phone } =
            toolCall.parameters as Record<string, string>;
          result = `I've noted your request for ${service}${preferred_date ? ` on ${preferred_date}` : ""}${preferred_time ? ` at ${preferred_time}` : ""}. Our team will call ${customer_phone} to confirm within 24 hours.`;
          break;
        }

        default:
          console.error("UNKNOWN_TOOL:", toolCall.name);
          result = "UNKNOWN_TOOL_NAME:" + toolCall.name;
      }

      return { toolCallId: toolCall.id, result };
    })
  );

  return NextResponse.json({ results });
}
