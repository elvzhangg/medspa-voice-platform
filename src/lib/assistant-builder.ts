import { Tenant, TransientAssistantConfig, VapiTool } from "@/types";
import { searchKnowledgeBase, formatKBContext } from "./knowledge-base";

const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL!;

/**
 * Build a transient Vapi assistant config for a specific tenant call.
 * Kept fast — no KB search at startup. KB is fetched on-demand via tool calls.
 */
export async function buildAssistantConfig(
  tenant: Tenant,
  callerNumber?: string
): Promise<TransientAssistantConfig> {
  const systemPrompt = buildSystemPrompt(tenant, "");

  // Each tool MUST have server.url set, otherwise Vapi won't call our server for tool execution
  const serverUrl = WEBHOOK_BASE_URL + "/api/vapi/webhook";

  const tools: VapiTool[] = [
    {
      type: "function",
      function: {
        name: "search_knowledge_base",
        description:
          "Search the med spa's knowledge base for specific information about services, pricing, policies, or FAQs",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The question or topic to search for",
            },
          },
          required: ["query"],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: "function",
      function: {
        name: "get_available_slots",
        description: "Checks the clinic's calendar for available appointment times for a specific service on a specific date.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "The date to check (YYYY-MM-DD)" },
            service: { type: "string", description: "The service they want (e.g. Botox)" }
          },
          required: ["date"]
        },
      },
      server: { url: serverUrl },
    },
    {
      type: "function",
      function: {
        name: "book_appointment",
        description: "Help a customer book an appointment at the med spa",
        parameters: {
          type: "object",
          properties: {
            service: { type: "string", description: "The service requested" },
            preferred_date: {
              type: "string",
              description: "Preferred date (YYYY-MM-DD)",
            },
            preferred_time: {
              type: "string",
              description: "Preferred time (HH:MM)",
            },
            customer_name: { type: "string" },
            customer_phone: { type: "string" },
          },
          required: ["service", "customer_name", "customer_phone"],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: "function",
      function: {
        name: "create_payment_link",
        description: "Generates a secure Stripe payment link and texts it to the caller for deposits or service payments.",
        parameters: {
          type: "object",
          properties: {
            amount: { type: "number", description: "The amount to charge in USD (e.g. 50.00)" },
            description: { type: "string", description: "What the payment is for (e.g. Botox Deposit)" }
          },
          required: ["amount"]
        },
      },
      server: { url: serverUrl },
    },
    {
      type: "function",
      function: {
        name: "log_referral",
        description: "Log when a new patient mentions they were referred by someone",
        parameters: {
          type: "object",
          properties: {
            referred_by_name: { type: "string", description: "Name of person who referred them" },
            new_patient_name: { type: "string" },
            new_patient_phone: { type: "string" },
          },
          required: ["referred_by_name"],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: "function",
      function: {
        name: "send_sms",
        description: "Sends a text message to the caller with information, links, or a confirmation.",
        parameters: {
          type: "object",
          properties: {
            message: { type: "string", description: "The content of the text message" }
          },
          required: ["message"]
        },
      },
      server: { url: serverUrl },
    },
  ];

  return {
    name: `${tenant.name} AI Receptionist`,
    model: {
      provider: "openai",
      model: "gpt-4o",
      systemPrompt,
      tools,
    },
    voice: {
      provider: "11labs",
      voiceId: tenant.voice_id,
    },
    firstMessage: tenant.greeting_message,
    endCallMessage:
      "Thank you for calling. Have a wonderful day! Goodbye.",
  };
}

function buildSystemPrompt(tenant: Tenant, kbContext: string): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });

  let depositInstruction = "";
  if (tenant.booking_config && (tenant.booking_config as any).deposit_amount) {
    const amount = (tenant.booking_config as any).deposit_amount;
    depositInstruction = `- MANDATORY: For all new consultations or appointments, you MUST offer to text a secure payment link for a $${amount} deposit to secure the spot. Say something like: "To secure your appointment, we collect a $${amount} deposit which goes toward your treatment. Can I text a secure payment link to this number now?"
- If they agree to the deposit, immediately use the 'create_payment_link' tool with amount ${amount} and description "Consultation Deposit".`;
  }

  return `You are a friendly, professional AI receptionist for ${tenant.name}, a med spa business.

## Your Role
- Answer questions about services, pricing, and appointments
- Help customers book appointments
- Provide information about policies and procedures
- Escalate complex medical questions to human staff

## Current Time
${timeStr} (Pacific Time)

## Guidelines
- Be warm, professional, and concise - this is a phone call
- Speak naturally without markdown formatting
- If you don't know something, use the search_knowledge_base tool
- Never make up prices or services - always verify with the knowledge base
- For booking requests, collect name, phone, service, and preferred time
${depositInstruction}
- For any other payments or billing questions, use the create_payment_link tool as well
- After a booking is confirmed, tell the caller they will receive a confirmation text message in a few moments.

${tenant.system_prompt_override ? `## Special Instructions\n${tenant.system_prompt_override}\n` : ""}

## Knowledge Base
${kbContext || "Use the search_knowledge_base tool to find information about services and policies."}
`;
}
