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
        description: "Log an appointment request and notify staff. Always collect backup scheduling preferences before calling this.",
        parameters: {
          type: "object",
          properties: {
            service: { type: "string", description: "The service requested (e.g. Botox, HydraFacial)" },
            preferred_date: { type: "string", description: "Primary preferred date (YYYY-MM-DD)" },
            preferred_time: { type: "string", description: "Primary preferred time (HH:MM or natural like '2pm')" },
            customer_name: { type: "string", description: "Full name of the caller" },
            customer_phone: { type: "string", description: "Caller's callback phone number" },
            backup_slots: {
              type: "string",
              description: "Any other dates/times they mentioned as alternatives, e.g. 'also Thursday mornings or any Friday afternoon'"
            },
            time_preference: {
              type: "string",
              description: "General time-of-day preference, e.g. 'mornings before noon', 'afternoons', 'evenings after 5'"
            },
            provider_preference: {
              type: "string",
              description: "Preferred provider or aesthetician, e.g. 'Dr. Sarah', 'no preference'"
            },
            referred_by: { type: "string", description: "Who referred them, if mentioned" },
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

  // Staff-forward booking instruction
  let forwardInstruction = "";
  if (tenant.booking_forward_enabled && (tenant.booking_forward_phones ?? []).length > 0) {
    forwardInstruction = `
## Appointment Booking Workflow (Staff Confirmation Required)
IMPORTANT: Our scheduling team personally reviews every appointment before confirming. Follow these steps exactly:

### Step 1 — Collect the essentials (conversationally, not like a form)
  1. Full name
  2. Best callback phone number (read it back to confirm)
  3. Service they want
  4. Preferred date and time

### Step 2 — Gather scheduling flexibility (always ask these)
After getting their preferred slot, ask:
- "And just in case that exact time isn't available — do you have any other days or times that could work for you?"
- "Do you have a preference for morning or afternoon appointments in general?"
- "Is there a specific provider or aesthetician you'd like to see, or no preference?"
Capture whatever they share — even a general preference like "mornings" or "Thursdays work best" is helpful.

### Step 3 — Call the 'book_appointment' tool
Include: service, preferred_date, preferred_time, customer_name, customer_phone, and whatever flexibility info was gathered in backup_slots, time_preference, and provider_preference.

### Step 4 — Close the call with this exact message (fill in the bracketed parts):
"We've received all the details for your [service] request. You'll receive a text confirmation at [their phone number] shortly once our team reviews and confirms your slot. And if [their preferred date/time] happens to not be available, we have your backup preferences noted so we can find the best fit. Is there anything else I can help you with?"

- Do NOT promise the specific slot is confirmed — the team reviews first.
- Do NOT say "I've booked your appointment" — say "we've received your request".
`;
  }

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
${forwardInstruction}
## Guidelines
- Be warm, professional, and concise - this is a phone call
- Speak naturally without markdown formatting
- If you don't know something, use the search_knowledge_base tool
- Never make up prices or services - always verify with the knowledge base
- For booking requests, collect name, phone, service, and preferred time
${depositInstruction}
- For any other payments or billing questions, use the create_payment_link tool as well
${!tenant.booking_forward_enabled ? "- After a booking is confirmed, tell the caller they will receive a confirmation text message in a few moments." : ""}

${tenant.system_prompt_override ? `## Special Instructions\n${tenant.system_prompt_override}\n` : ""}

## Knowledge Base
${kbContext || "Use the search_knowledge_base tool to find information about services and policies."}
`;
}
