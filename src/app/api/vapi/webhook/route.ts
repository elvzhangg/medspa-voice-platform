import { NextRequest, NextResponse } from "next/server";
import { getTenantByPhoneNumber } from "@/lib/tenants";
import { buildAssistantConfig } from "@/lib/assistant-builder";
import { searchKnowledgeBase, formatKBContext } from "@/lib/knowledge-base";

/**
 * Vapi server webhook handler
 *
 * Handles:
 * - assistant-request: Return tenant-specific assistant config when a call comes in
 * - tool-calls: Handle tool calls from the assistant during a call
 * - end-of-call-report: Log call summaries
 * - status-update: Track call lifecycle
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body.message as Record<string, unknown> | undefined;
  if (!message) {
    return NextResponse.json({ error: "No message" }, { status: 400 });
  }

  const type = message.type as string;

  switch (type) {
    case "assistant-request":
      return handleAssistantRequest(message);
    case "tool-calls":
      return handleToolCalls(message);
    case "end-of-call-report":
      await handleEndOfCall(message);
      return NextResponse.json({ received: true });
    default:
      return NextResponse.json({ received: true });
  }
}

/**
 * When a call comes in, look up the tenant by the dialed number
 * and return their personalized assistant config.
 * Must respond within 7.5 seconds.
 */
async function handleAssistantRequest(message: Record<string, unknown>) {
  const call = message.call as Record<string, unknown> | undefined;

  // Vapi sends the dialed Vapi phone number object under call.phoneNumber
  const phoneNumberObj = call?.phoneNumber as Record<string, unknown> | undefined;
  const dialedNumber = phoneNumberObj?.number as string | undefined;

  console.log("assistant-request | dialed:", dialedNumber, "| call:", JSON.stringify(call?.id));

  if (!dialedNumber) {
    console.error("No phone number found in payload:", JSON.stringify(message));
    return fallbackAssistant("No phone number found in request");
  }

  const tenant = await getTenantByPhoneNumber(dialedNumber);

  if (!tenant) {
    console.error(`No tenant found for number: ${dialedNumber}`);
    return fallbackAssistant(`No tenant found for ${dialedNumber}`);
  }

  const callerNumber = (call?.customer as Record<string, unknown> | undefined)?.number as string | undefined;
  const assistant = await buildAssistantConfig(tenant, callerNumber);

  return NextResponse.json({ assistant });
}

/**
 * Handle tool/function calls from the assistant during a live call.
 * Vapi sends tool-calls (not function-call) with toolWithToolCallList.
 */
async function handleToolCalls(message: Record<string, unknown>) {
  const call = message.call as Record<string, unknown> | undefined;
  const toolList = message.toolCallList as Array<Record<string, unknown>> | undefined;

  if (!toolList || toolList.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Look up tenant once for all tool calls
  const phoneNumberObj = call?.phoneNumber as Record<string, unknown> | undefined;
  const dialedNumber = phoneNumberObj?.number as string | undefined;
  const tenant = dialedNumber ? await getTenantByPhoneNumber(dialedNumber) : null;

  const results = await Promise.all(
    toolList.map(async (toolCall) => {
      const name = toolCall.name as string;
      const toolCallId = toolCall.id as string;
      const parameters = toolCall.parameters as Record<string, unknown> | undefined ?? {};

      let result = "";

      switch (name) {
        case "search_knowledge_base": {
          if (!tenant) {
            result = "Sorry, I couldn't access our information system right now.";
            break;
          }
          const query = parameters.query as string;
          const docs = await searchKnowledgeBase(tenant.id, query, 4);
          result = formatKBContext(docs) || "I couldn't find specific information about that. Let me connect you with our team.";
          break;
        }

        case "book_appointment": {
          const { service, preferred_date, preferred_time, customer_name, customer_phone } =
            parameters as Record<string, string>;

          console.log("Appointment request:", { service, preferred_date, preferred_time, customer_name, customer_phone });

          result = `I've noted your request for ${service}${preferred_date ? ` on ${preferred_date}` : ""}${preferred_time ? ` at ${preferred_time}` : ""}. Our team will call ${customer_phone} to confirm your appointment within 24 hours.`;
          break;
        }

        default:
          result = "I'm not sure how to handle that request.";
      }

      return { toolCallId, result };
    })
  );

  return NextResponse.json({ results });
}

/**
 * Log end-of-call summaries
 */
async function handleEndOfCall(message: Record<string, unknown>) {
  const call = message.call as Record<string, unknown> | undefined;
  console.log("Call ended:", {
    call_id: call?.id,
    ended_reason: message.endedReason,
    duration: (call as Record<string, unknown> | undefined)?.duration,
    timestamp: new Date().toISOString(),
  });
}

function fallbackAssistant(reason: string) {
  console.error("Using fallback assistant:", reason);
  return NextResponse.json({
    assistant: {
      name: "AI Receptionist",
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a receptionist. Apologize and let the caller know there's a technical issue. Ask them to call back shortly or leave their name and number.",
          },
        ],
      },
      voice: { provider: "11labs", voiceId: "rachel" },
      firstMessage: "Thank you for calling. I'm sorry, we're experiencing a brief technical issue. Could I take your name and number so we can call you right back?",
    },
  });
}
