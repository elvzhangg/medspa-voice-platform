import { Tenant, TransientAssistantConfig, VapiTool } from "@/types";
import { searchKnowledgeBase, formatKBContext } from "./knowledge-base";
import { lookupCaller, buildCallerContext, ClientProfile } from "./client-intelligence";
import { isProfileStale, syncClientFromPlatformBackground } from "./client-sync";
import { supabaseAdmin } from "./supabase";

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
};

interface StaffRow {
  name: string;
  title: string | null;
  services: string[] | null;
  specialties: string[] | null;
  ai_notes: string | null;
  working_hours: Record<string, { open: string; close: string }> | null;
}

/**
 * Fetch the tenant's active roster and format it as a system-prompt block.
 * Returns empty string when the tenant has no staff configured — the AI
 * then falls back to the generic "ask the caller" flow.
 */
async function buildProviderRoster(tenantId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("staff")
    .select("name, title, services, specialties, ai_notes, working_hours")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name");

  const rows = (data ?? []) as StaffRow[];
  if (rows.length === 0) return "";

  const lines = rows.map((s) => {
    const parts: string[] = [`- ${s.name}`];
    if (s.title) parts.push(` — ${s.title}`);

    // Specialty tags get inline emphasis, services roll into the sentence.
    const tags = s.specialties?.filter(Boolean) ?? [];
    if (tags.length) parts.push(` (specializes in ${tags.join(", ")})`);

    // Collapse working_hours into a compact "Mon–Thu 9–5, Sat 10–2" style string.
    const hours = s.working_hours;
    if (hours) {
      const segments: string[] = [];
      for (const day of DAY_ORDER) {
        const block = hours[day];
        if (block?.open && block?.close) {
          segments.push(`${DAY_LABELS[day]} ${block.open}–${block.close}`);
        }
      }
      if (segments.length) parts.push(`. Works ${segments.join(", ")}`);
    }

    if (s.ai_notes?.trim()) parts.push(`. ${s.ai_notes.trim()}`);

    return parts.join("");
  });

  return `
## Providers at this clinic
${lines.join("\n")}

When callers ask "who works there?" or "who do you have for [service]?", answer using the roster above. Match callers to providers based on specialty and notes when helpful (e.g. suggest a provider who specializes in what they need). Only filter availability by a specific provider via get_available_slots when the caller names one.
`;
}

const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL!;

/**
 * Build a transient Vapi assistant config for a specific tenant call.
 * Kept fast — no KB search at startup. KB is fetched on-demand via tool calls.
 */
export async function buildAssistantConfig(
  tenant: Tenant,
  callerNumber?: string
): Promise<TransientAssistantConfig> {
  // Look up returning-caller context (identity, history, preferences).
  // Non-blocking enough — single indexed query by (tenant_id, phone).
  let callerProfile: ClientProfile | null = null;
  if (callerNumber) {
    callerProfile = await lookupCaller(tenant.id, callerNumber);

    // Phase 2 sync — if the tenant is direct-book and this caller's cached
    // platform history is stale or missing, refresh it in the background.
    // The current call uses whatever we already have cached; the NEXT call
    // will benefit from the refresh. Never awaited — don't block dial-in.
    if (isProfileStale(callerProfile?.last_synced_at)) {
      syncClientFromPlatformBackground(tenant.id, callerNumber);
    }
  }
  const callerContext = buildCallerContext(callerProfile);

  // Personalize first message if we recognize them
  let firstMessage = tenant.greeting_message;
  if (callerProfile && !callerProfile.no_personalization && callerProfile.first_name) {
    firstMessage = `Hi ${callerProfile.first_name}, welcome back to ${tenant.name}! How can I help you today?`;
  }

  // Fetch the active staff roster — injected into the system prompt so the
  // AI can introduce providers, answer "who's here?", and steer callers
  // toward specialists based on ai_notes/specialties.
  const providerRoster = await buildProviderRoster(tenant.id);

  const systemPrompt = buildSystemPrompt(tenant, "", callerContext, providerRoster);

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
        description: "Checks the clinic's calendar for available appointment times on a specific date. Pass the provider name if the caller wants a specific aesthetician so only that person's availability is returned. If they have no preference, omit provider.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "The date to check (YYYY-MM-DD)" },
            service: { type: "string", description: "The service they want (e.g. Botox, HydraFacial)" },
            provider: { type: "string", description: "Optional: the specific provider/aesthetician name they asked for, e.g. 'Dr. Sarah'. Omit if they have no preference." }
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
            provider_preference: { type: "string", description: "Provider they asked for (already used to filter availability), e.g. 'Dr. Sarah' or 'No preference'" },
            provider_flexibility: { type: "string", description: "How flexible they are on provider if their primary isn't available. E.g. 'open to any aesthetician', 'would rather wait for Dr. Sarah', 'second choice would be Dr. Mia'. Omit if they had no provider preference." },
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
        description: "Attach backup scheduling preferences to the booking that was just created. Call this AFTER book_appointment succeeds, once you've asked the caller about flexibility. Staff use these only if the primary slot later falls through. (Provider preference is NOT collected here — it's already locked in via the filtered availability search.)",
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
        name: "update_client_profile",
        description: "Record or update facts about the caller (name, email, preferences, referral source, notes) so future calls feel personal. Call this whenever the caller volunteers information that would help next time — e.g. spells out their name, shares their email, mentions who referred them, tells you their preferred aesthetician, or notes an allergy/sensitivity we should remember. Do NOT probe — only call when they give the info naturally.",
        parameters: {
          type: "object",
          properties: {
            phone: { type: "string", description: "The caller's phone number (required to identify which profile to update)." },
            first_name: { type: "string" },
            last_name: { type: "string" },
            email: { type: "string" },
            preferred_provider: { type: "string", description: "Their go-to aesthetician going forward." },
            preferred_time: { type: "string", description: "e.g. 'weekday mornings', 'after 5pm'." },
            referral_source: { type: "string", description: "Who or what brought them in (person's name, Instagram, Google, etc.)." },
            notes: { type: "string", description: "Short free-form note worth remembering for next time (e.g. 'allergic to lidocaine', 'prefers text over call')." },
          },
          required: ["phone"],
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
    firstMessage,
    endCallMessage:
      "Thank you for calling. Have a wonderful day! Goodbye.",
  };
}

function buildSystemPrompt(
  tenant: Tenant,
  kbContext: string,
  callerContext: string = "",
  providerRoster: string = ""
): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });

  // Availability-first booking workflow
  const forwardInstruction = `
## Appointment Booking Workflow — Service & Provider → Availability → Book → Backups
Follow these steps IN ORDER. Provider preference is a HARD filter on availability and must be confirmed BEFORE checking open slots.

### Step 1 — Figure out what service + who they want to see
Conversationally collect:
  • Service (e.g. Botox, HydraFacial)
  • Provider preference: ask "Do you have a specific provider or aesthetician you'd like to see, or are you open to anyone?"
    - If they name someone → capture the name (e.g. "Dr. Sarah") as provider_preference.
      Then ALWAYS follow up: "And if [Provider] happens to not be available, would you be open to seeing someone else, or would you rather wait for [Provider] specifically?"
      Capture the answer as provider_flexibility — e.g. "open to any other aesthetician", "second choice would be Dr. Mia", "would rather wait for Dr. Sarah".
    - If they're open → no preference; skip the flexibility question.
  • Preferred date (or a day range like "sometime next week")
  • Preferred time (or a window like "afternoon")

### Step 2 — Check availability using get_available_slots (MANDATORY)
Call 'get_available_slots' with:
  • date = their preferred date
  • service = the service
  • provider = the specific provider they asked for (omit if they had no preference)

Then:
  • If the list is EMPTY and a provider was specified → "I'm sorry, [Provider] doesn't have any openings that day. Would another day work, or would you be open to a different provider?" — then re-check with the new info.
  • If they gave a specific time → check whether that exact slot is in the returned list.
      - If yes → read it back: "I can see [Provider if any] has [time] open on [date] — should I grab that for you?"
      - If no → offer the closest alternatives from the returned list.
  • If they didn't give a specific time → offer 2–3 slots from the list naturally.
  • If the day has no availability at all → suggest the next business day and re-check.

Never invent, guess, or assume a slot is open. Only offer times returned by get_available_slots.

### Step 3 — Collect caller identity (only after a slot is agreed)
  • Full name
  • Best callback phone number (read digits back to confirm)

### Step 4 — Call 'book_appointment' for the agreed slot
Pass: service, preferred_date, preferred_time (the verified-available one), customer_name, customer_phone, provider_preference (the provider name from Step 1, or "No preference"), and provider_flexibility (their answer from Step 1, or omit if no provider preference).
Wait for the tool response. If it returns that the slot just got taken, apologize and go back to Step 2 with a new date/time.

### Step 5 — Read the confirmation to the caller (fill brackets naturally):
"Perfect — I've sent your appointment request for [service][ with [Provider] if they asked for one] on [date] at [time] over to our scheduling team. You'll receive a text confirmation at [phone number] shortly."

### Step 6 — AFTER confirming, collect backup preferences (the hedge)
Now that the primary request is locked in, warmly ask:
  • "Just in case anything comes up on our end — are there any other days or times that would also work for you?"
  • "Do you generally prefer mornings or afternoons?"
Whatever they share, call 'update_booking_preferences' with customer_phone plus backup_slots and/or time_preference.
Do NOT re-ask about provider — that's already locked in via Step 1.
If they say "no, just that one time works" — skip the tool call. Don't force it.

### Step 7 — Close warmly
"Great, we've got everything we need. You'll hear from us by text very soon. Anything else I can help you with?"

### Critical Rules
- NEVER skip the provider-preference question in Step 1. The wrong provider = wrong calendar = invalid availability.
- NEVER call book_appointment for a slot that wasn't returned by get_available_slots.
- NEVER promise the booking is fully confirmed — say "your request has been sent" / "you'll get a confirmation text shortly".
- NEVER ask for backups BEFORE book_appointment — it makes the caller feel the primary slot isn't real.
`;

  let depositInstruction = "";
  const bookingConfig = tenant.booking_config as any;
  // Tenant must explicitly toggle deposits on in Clinic Setup; a nonzero
  // amount alone isn't enough — this lets a tenant pause deposits without
  // wiping their configured amount.
  if (bookingConfig?.deposit_enabled && bookingConfig?.deposit_amount) {
    const amount = bookingConfig.deposit_amount;
    depositInstruction = `- MANDATORY: For all new consultations or appointments, you MUST offer to text a secure payment link for a $${amount} deposit to secure the spot. Say something like: "To secure your appointment, we collect a $${amount} deposit which goes toward your treatment. Can I text a secure payment link to this number now?"
- If they agree to the deposit, immediately use the 'create_payment_link' tool with amount ${amount} and description "Consultation Deposit".`;
  }

  // Always-available clinic facts. Short-and-frequent info goes in the
  // prompt instead of the KB so the AI doesn't have to tool-call for it.
  const paymentPolicy = (tenant.booking_config as any)?.payment_policy_notes?.trim();
  const directions = tenant.directions_parking_info?.trim();

  const locationBlock = directions
    ? `\n## Location & Parking\n${directions}\nWhen callers ask "where are you?" or about parking, answer directly using this info.\n`
    : "";

  const paymentBlock = paymentPolicy
    ? `\n## Payment & Billing Guidance\n${paymentPolicy}\nWhen callers ask about cost, financing, or payment methods, follow this guidance. For longer policy questions (refunds, detailed pricing), you may still need to use search_knowledge_base.\n`
    : "";

  return `You are a friendly, professional AI receptionist for ${tenant.name}, a med spa business.

## Your Role
- Answer questions about services, pricing, and appointments
- Help customers book appointments
- Provide information about policies and procedures
- Escalate complex medical questions to human staff

## Current Time
${timeStr} (Pacific Time)
${callerContext}${providerRoster}${locationBlock}${paymentBlock}
## Remembering the Caller
When the caller naturally shares information that would help us serve them better next time — their full name, email address, who referred them, a provider they want to stick with, a time-of-day preference, or something we should remember (e.g. an allergy or that they prefer texts) — call the 'update_client_profile' tool with their phone number and the relevant fields. Do this silently, in the background; don't announce that you're "saving" anything. Never interrogate them for profile fields — only capture what they volunteer.
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
