import { NextRequest, NextResponse } from "next/server";
import { VapiCallPayload } from "@/types";
import { getTenantByPhoneNumber } from "@/lib/tenants";
import { buildAssistantConfig } from "@/lib/assistant-builder";
import { searchKnowledgeBase, formatKBContext } from "@/lib/knowledge-base";

/**
 * Main Vapi webhook handler
 *
 * Handles:
 * - assistant-request: Return tenant-specific assistant config when a call comes in
 * - function-call: Handle tool calls from the assistant during a call
 * - end-of-call-report: Log call summaries
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as VapiCallPayload;
  const { message } = body;

  switch (message.type) {
    case "assistant-request":
      return handleAssistantRequest(message);

    case "function-call":
      return handleFunctionCall(message);

    case "end-of-call-report":
      await handleEndOfCall(message);
      return NextResponse.json({ received: true });

    default:
      return NextResponse.json({ received: true });
  }
}

/**
 * When a call comes in, look up the tenant by the dialed number
 * and return their personalized assistant config
 */
async function handleAssistantRequest(message: VapiCallPayload["message"]) {
  const dialedNumber = message.call.phoneNumber?.number;
  const callerNumber = message.call.customer?.number;

  if (!dialedNumber) {
    return NextResponse.json(
      { error: "No phone number in request" },
      { status: 400 }
    );
  }

  // Find which med spa this number belongs to
  const tenant = await getTenantByPhoneNumber(dialedNumber);

  if (!tenant) {
    console.error(`No tenant found for number: ${dialedNumber}`);
    // Fall back to a generic assistant
    return NextResponse.json({
      assistant: {
        name: "AI Receptionist",
        model: {
          provider: "openai",
          model: "gpt-4o",
          systemPrompt:
            "You are a friendly receptionist. The business you're representing could not be identified. Apologize and ask the caller to try again later.",
        },
        voice: { provider: "11labs", voiceId: "rachel" },
        firstMessage:
          "Hello! I'm sorry, but I'm having trouble identifying this business. Please try calling back later.",
      },
    });
  }

  // Build personalized assistant config for this tenant
  const assistant = await buildAssistantConfig(tenant, callerNumber ?? undefined);

  return NextResponse.json({ assistant });
}

/**
 * Handle tool/function calls from the assistant during a live call
 */
async function handleFunctionCall(message: VapiCallPayload["message"]) {
  const { functionCall, call } = message;

  if (!functionCall) {
    return NextResponse.json({ result: "No function call provided" });
  }

  const { name, parameters } = functionCall;

  switch (name) {
    case "search_knowledge_base": {
      // We need the tenant ID — look it up from the phone number stored in call metadata
      const dialedNumber = call.phoneNumber?.number;
      if (!dialedNumber) {
        return NextResponse.json({ result: "Could not identify the business." });
      }

      const tenant = await getTenantByPhoneNumber(dialedNumber);
      if (!tenant) {
        return NextResponse.json({ result: "Business information not available." });
      }

      const query = parameters.query as string;
      const docs = await searchKnowledgeBase(tenant.id, query, 4);
      const context = formatKBContext(docs);

      return NextResponse.json({
        result: context || "I couldn't find specific information about that. Let me connect you with our team.",
      });
    }

    case "book_appointment": {
      // TODO: Integrate with booking system (e.g. Acuity, Mindbody, etc.)
      const { service, preferred_date, preferred_time, customer_name, customer_phone } =
        parameters as Record<string, string>;

      console.log("Appointment request:", {
        service,
        preferred_date,
        preferred_time,
        customer_name,
        customer_phone,
        call_id: call.id,
      });

      // For now, acknowledge and log — integrate booking API here
      return NextResponse.json({
        result: `I've noted your request for ${service} on ${preferred_date || "a date to be confirmed"} at ${preferred_time || "a time to be confirmed"}. Our team will call ${customer_phone} to confirm your appointment.`,
      });
    }

    default:
      return NextResponse.json({ result: "Function not recognized." });
  }
}

/**
 * Log end-of-call summaries for analytics
 */
async function handleEndOfCall(message: VapiCallPayload["message"]) {
  console.log("Call ended:", {
    call_id: message.call.id,
    timestamp: new Date().toISOString(),
  });
  // TODO: Store call logs in Supabase for analytics dashboard
}
