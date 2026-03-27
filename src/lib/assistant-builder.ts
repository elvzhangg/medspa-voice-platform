import { Tenant, TransientAssistantConfig, VapiTool } from "@/types";
import { searchKnowledgeBase, formatKBContext } from "./knowledge-base";

const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL!;

/**
 * Build a transient Vapi assistant config for a specific tenant call
 */
export async function buildAssistantConfig(
  tenant: Tenant,
  callerNumber?: string
): Promise<TransientAssistantConfig> {
  // Fetch relevant KB docs as initial context (top general docs)
  const kbDocs = await searchKnowledgeBase(
    tenant.id,
    "services pricing appointments policies",
    8
  );
  const kbContext = formatKBContext(kbDocs);

  const systemPrompt = buildSystemPrompt(tenant, kbContext);

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
      server: {
        url: `${WEBHOOK_BASE_URL}/api/vapi/webhook`,
      },
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
      server: {
        url: `${WEBHOOK_BASE_URL}/api/vapi/webhook`,
      },
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
- Keep responses under 3 sentences unless more detail is truly needed

${tenant.system_prompt_override ? `## Special Instructions\n${tenant.system_prompt_override}\n` : ""}

## Knowledge Base
${kbContext || "Use the search_knowledge_base tool to find information about services and policies."}
`;
}
