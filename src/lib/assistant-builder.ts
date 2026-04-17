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
        description: "Submit an appointment request for a slot that has ALREADY been verified as available via get_available_slots. This locks the slot, notifies staff, and triggers the customer SMS confirmation. Do NOT call this until get_available_slots has returned the chosen slot as available.",
        parameters: {
          type: "object",
          properties: {
            service: { type: "string", description: "The service requested (e.g. Botox, HydraFacial)" },
            preferred_date: { type: "string", description: "Verified-available date (YYYY-MM-DD)" },
            preferred_time: { type: "string", description: "Verified-available time (HH:MM 24h or natural like '2:00 PM')" },
            customer_name: { type: "string", description: "Full name of the caller" },
            customer_phone: { type: "string", description: "Caller's callback phone number" },
            referred_by: { type: "string", description: "Who referred them, if mentioned" },
          },
          required: ["service", "preferred_date", "preferred_time", "customer_name", "customer_phone"],
        },
      },
      server: { url: serverUrl },
    },
    {
      type: "function",
      function: {
        name: "update_booking_preferences",
        description: "Attach backup scheduling preferences to the booking that was just created. Call this AFTER book_appointment succeeds, once you've asked the caller about flexibility. Staff use these backups only if the primary slot later falls through.",
        parameters: {
          type: "object",
          properties: {
            customer_phone: { type: "string", description: "The same callback number used in book_appointment — used to locate the booking." },
            backup_slots: {
              type: "string",
              description: "Other dates/times they'd be open to as fallbacks, e.g. 'Thursday mornings or any Friday afternoon'"
            },
            time_preference: {
              type: "string",
              description: "General time-of-day preference, e.g. 'mornings before noon', 'afternoons'"
            },
            provider_preference: {
              type: "string",
              description: "Preferred provider or aesthetician, e.g. 'Dr. Sarah', 'no preference'"
            },
          },
          required: ["customer_phone"],
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

  // Availability-first booking workflow
  const forwardInstruction = `
## Appointment Booking Workflow — Availability First, Then Book, Then Backups
Follow these steps IN ORDER. Do not skip availability checking.

### Step 1 — Figure out what they want
Conversationally collect:
  • Service (e.g. Botox, HydraFacial)
  • Preferred date (or a day range like "sometime next week")
  • Preferred time (or a window like "afternoon")

### Step 2 — Check availability using get_available_slots (MANDATORY)
Call 'get_available_slots' with their preferred date and service.
  • If they gave a specific time → check whether that exact slot is in the returned list.
      - If yes → read it back: "I can see we have [time] available on [date] — should I grab that for you?"
      - If no → offer the closest alternatives from the returned list: "That exact time isn't open, but we do have [slot A] and [slot B] on that day. Would either of those work?"
  • If they didn't give a specific time → offer 2–3 slots from the returned list naturally: "On [date] we have [slot A], [slot B], or [slot C] open — which works best?"
  • If the day has no availability at all → suggest the next business day and re-check.

Never invent, guess, or assume a slot is open. Only offer times returned by get_available_slots.

### Step 3 — Collect caller identity (only after a slot is agreed)
  • Full name
  • Best callback phone number (read digits back to confirm)

### Step 4 — Call 'book_appointment' for the agreed slot
Pass: service, preferred_date, preferred_time (the verified-available one), customer_name, customer_phone.
Wait for the tool response. It will either succeed or tell you the slot just got taken by someone else — if that happens, apologize, go back to Step 2 with a new date.

### Step 5 — Read the confirmation to the caller (use this exact script, fill brackets):
"Perfect — I've sent your appointment request for [service] on [date] at [time] over to our scheduling team. You'll receive a text confirmation at [phone number] shortly at this number."

### Step 6 — AFTER confirming, collect backup preferences (this is the hedge)
Now that the request is locked in, warmly ask:
  • "Just in case anything comes up on our end — are there any other days or times that would also work for you?"
  • "Do you generally prefer mornings or afternoons?"
  • "Is there a specific provider you'd like, or no preference?"
Whatever they share, call 'update_booking_preferences' with customer_phone (same as before) plus backup_slots / time_preference / provider_preference.
If they say "no, just that one time works" — skip the tool call. Don't force it.

### Step 7 — Close warmly
"Great, we've got everything we need. You'll hear from us by text very soon. Anything else I can help you with?"

### Critical Rules
- NEVER call book_appointment for a slot that wasn't returned by get_available_slots.
- NEVER promise the booking is fully confirmed — say "your request has been sent" / "you'll get a confirmation text shortly".
- NEVER collect backup preferences BEFORE book_appointment — it makes the caller feel like their primary slot isn't real.
`;

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

${tenant.system_prompt_override ? `## Special Instructions\n${tenant.system_prompt_override}\n` : ""}

## Knowledge Base
${kbContext || "Use the search_knowledge_base tool to find information about services and policies."}
`;
}
