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
  if (rows.length === 0) {
    // No staff yet — but the AI still gets asked "who works there?". Without
    // this block it drifts into "I don't have a knowledge base..." territory,
    // leaking internal terminology. Give it a graceful, on-brand fallback.
    return `
## Providers at this clinic
The team roster hasn't been shared with you. When a caller asks "who works there?", "who do you have for [service]?", or wants a provider intro, NEVER say you don't have a list, system, database, or knowledge base. Instead respond warmly and offer a human follow-up, e.g.: "Our team will be the best to walk you through that — I can have someone reach out by text with provider details, or get you on the books for a consult, whichever you prefer."
`;
  }

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

/**
 * Fetch tenants.booking_settings.service_durations and format as a system-prompt
 * block. Powers AI answers like "How long is a HydraFacial?" without a tool
 * call. Returns empty string when no per-service durations are configured —
 * the AI then says "I'd estimate around an hour" or punts to staff.
 *
 * Mirrors the same source the Google Calendar adapter reads from (via
 * loadTenantIntegration → ctx.tenantData.serviceDurations) so what the AI
 * SAYS the appointment will take matches what gets carved out on the calendar.
 */
async function buildServiceDurationsBlock(tenantId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("tenants")
    .select("booking_settings")
    .eq("id", tenantId)
    .maybeSingle();

  type Settings = { service_durations?: Record<string, number> };
  const durations = (data?.booking_settings as Settings | null)?.service_durations;
  if (!durations || typeof durations !== "object") return "";

  const entries = Object.entries(durations).filter(
    ([k, v]) => k !== "default" && typeof v === "number" && v > 0
  );
  if (entries.length === 0) return "";

  // Sort longest first — typically pricier/more involved treatments matter more
  // when scheduling and AI should mention duration prominently for those.
  entries.sort((a, b) => (b[1] as number) - (a[1] as number));

  const lines = entries.map(([name, mins]) => `- ${name}: ${mins} minutes`);
  const defaultMins = typeof durations.default === "number" ? durations.default : 60;

  return `
## Service durations
${lines.join("\n")}
- All other services: ${defaultMins} minutes by default

When callers ask how long an appointment takes, answer using these durations directly. The booking system carves out exactly this much time, so what you tell the caller matches what gets booked on the calendar.
`;
}

/**
 * Format the tenant's clinic-level open/close hours into a system-prompt
 * block. The AI uses this to (a) reject impossible booking times like
 * "Sunday at 11am" when the clinic is closed Sundays, and (b) answer
 * "are you open right now?" without a tool call. Empty/missing hours
 * yields an empty string — no block injected, no false claims about
 * being open.
 */
function buildBusinessHoursBlock(tenant: Tenant): string {
  const hours = tenant.business_hours;
  if (!hours || typeof hours !== "object") return "";

  const lines: string[] = [];
  for (const day of DAY_ORDER) {
    const block = (hours as Record<string, { open?: string; close?: string } | null | undefined>)[day];
    if (block?.open && block?.close) {
      lines.push(`- ${DAY_LABELS[day]}: ${block.open}–${block.close}`);
    } else {
      lines.push(`- ${DAY_LABELS[day]}: CLOSED`);
    }
  }

  return `
## Clinic Hours
${lines.join("\n")}

Use these to sanity-check any time the caller proposes. If they ask for a slot on a day we're CLOSED, say so plainly and offer the next open day. If they ask for a time outside the open hours on a day we're open, push to the closest in-hours alternative. Never offer or book a time the clinic isn't open.
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
  // In parallel, fetch per-service durations from tenants.booking_settings
  // so AI answers about appointment length match what gets booked.
  const [providerRoster, serviceDurationsBlock] = await Promise.all([
    buildProviderRoster(tenant.id),
    buildServiceDurationsBlock(tenant.id),
  ]);
  const businessHoursBlock = buildBusinessHoursBlock(tenant);

  // SMS consent capture is only relevant when at least one outbound SMS
  // feature is on for this tenant. We add both the prompt block and the
  // record_sms_consent tool conditionally so calls stay short for tenants
  // who rely entirely on their booking platform's native SMS.
  const smsAny = Boolean(
    tenant.sms_confirmation_enabled ||
      tenant.sms_reminders_enabled ||
      tenant.sms_followup_enabled
  );
  const consentBlock = smsAny ? buildConsentPromptBlock(tenant) : "";

  const systemPrompt = buildSystemPrompt(
    tenant,
    "",
    callerContext,
    providerRoster,
    consentBlock,
    serviceDurationsBlock,
    businessHoursBlock
  );

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

  if (smsAny) {
    tools.push({
      type: "function",
      function: {
        name: "record_sms_consent",
        description:
          "Record that the caller verbally agreed to receive SMS from the clinic (appointment confirmations, reminders, and/or aftercare instructions). Only call this AFTER you've explicitly asked for consent and the caller has clearly said yes. Never assume consent.",
        parameters: {
          type: "object",
          properties: {
            phone_number: {
              type: "string",
              description:
                "The phone number the caller agreed to be texted at. Confirm this with them out loud before logging.",
            },
            consent_excerpt: {
              type: "string",
              description:
                "A brief verbatim excerpt (1–2 sentences) of how the caller granted consent, e.g. 'Yes, that's fine, you can text me.'",
            },
          },
          required: ["phone_number", "consent_excerpt"],
        },
      },
      server: { url: serverUrl },
    });
  }

  return {
    name: `${tenant.name} AI Clientele Specialist`,
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

function buildConsentPromptBlock(tenant: Tenant): string {
  const parts: string[] = [];
  if (tenant.sms_confirmation_enabled) parts.push("appointment confirmations");
  if (tenant.sms_reminders_enabled) parts.push("appointment reminders");
  if (tenant.sms_followup_enabled) parts.push("aftercare instructions after your visit");
  const list =
    parts.length === 1
      ? parts[0]
      : parts.length === 2
      ? `${parts[0]} and ${parts[1]}`
      : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;

  return `
## SMS Consent (MANDATORY — only skip if caller has no phone number)
Before ending the call, explicitly ask for SMS consent. Do NOT assume it.

1. Read back their phone number: "Before we wrap up — can I confirm the best number to text you at is [phone]?"
2. Ask: "Is it okay if we text you at that number with ${list}? You can reply STOP anytime to opt out."
3. If they clearly say yes → call the 'record_sms_consent' tool with phone_number and a short verbatim excerpt of their affirmative response.
4. If they hesitate, say no, or want to think about it → do NOT call the tool. Say "no problem, we won't text you" and proceed.
5. Never read long disclaimers. Keep the ask conversational.
6. Never send a text under any other tool before consent is recorded.
`;
}

function buildSystemPrompt(
  tenant: Tenant,
  kbContext: string,
  callerContext: string = "",
  providerRoster: string = "",
  consentBlock: string = "",
  serviceDurationsBlock: string = "",
  businessHoursBlock: string = ""
): string {
  const now = new Date();
  const tz = "America/Los_Angeles";
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
  // Build today's calendar date in Pacific time, then derive tomorrow's date
  // arithmetically (one Pacific day later). Doing this with toLocaleDateString
  // avoids UTC-vs-Pacific midnight drift bugs.
  const ymdParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const todayYmd = `${ymdParts.find(p => p.type === "year")!.value}-${ymdParts.find(p => p.type === "month")!.value}-${ymdParts.find(p => p.type === "day")!.value}`;
  const todayWeekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
  const todayLong = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(tomorrow);
  const tomorrowYmd = `${tParts.find(p => p.type === "year")!.value}-${tParts.find(p => p.type === "month")!.value}-${tParts.find(p => p.type === "day")!.value}`;
  const tomorrowWeekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(tomorrow);

  // Availability-first booking workflow
  const forwardInstruction = `
## Caller Intent — figure this out FIRST
Before you start any booking workflow, listen for what the caller actually wants:

  • **New appointment** → use the booking workflow below.
  • **Cancel an existing appointment** → you can't cancel directly. Say warmly: "I'm not able to cancel from this line, but I can have someone from the team text or call you right back to take care of that. What's the best number to reach you?" Then capture their callback number using the same 10-digit phone protocol from Step 3 below, and call 'send_sms' with a message to the front desk style ("Caller [name] would like to cancel [appointment if known] — please follow up at [phone]"). Do NOT pretend the cancellation is done.
  • **Reschedule an existing appointment** → same as cancel: not directly handled here. Say: "I can help you with that — let me have someone from the team reach out so we don't accidentally double-book you. What's the best number?" Then send_sms to the front desk with the request.
  • **General question** (hours, services, pricing, who works there) → answer it; don't push booking.
  • **Mixed** ("I want to reschedule my Tuesday and also book a filler") → handle the new booking via the workflow, and queue the reschedule as a handoff via send_sms.

Never tell the caller "your appointment is cancelled" or "your appointment has been moved" — you don't have the tools to do that. Only the team can.

## Appointment Booking Workflow — Service & Provider → Availability → Book → Backups
Follow these steps IN ORDER. Provider preference is a HARD filter on availability and must be confirmed BEFORE checking open slots.

### Step 1 — Figure out what service + who they want to see
Conversationally collect:
  • **Who is the appointment for?** Quickly verify whether the caller is booking for themselves or someone else. If it's clearly for themselves (e.g. "I'd like to come in") just continue. If anything suggests otherwise ("I want to book my mom", "this is for my daughter"), ask: "Got it — and who am I booking this for? Just need their name and best contact number for the appointment record." Capture THEIR name and phone as customer_name + customer_phone (not the caller's). Note in your head that the caller is booking on behalf of someone, so don't confuse identities later.
  • **Service.** Match what they ask for against the Service durations block above and any KB context. If the service isn't something we offer, do NOT invent details, pricing, or a duration — say plainly: "We don't offer [service] here, but [closest service we do offer] is similar — would that be of interest, or would you rather have someone follow up with you about your specific question?" Never tell them about a service we don't run.
  • Provider preference: ask "Do you have a specific provider or aesthetician you'd like to see, or are you open to anyone?"
    - If they name someone → capture the name (e.g. "Dr. Sarah") as provider_preference.
      Then ALWAYS follow up: "And if [Provider] happens to not be available, would you be open to seeing someone else, or would you rather wait for [Provider] specifically?"
      Capture the answer as provider_flexibility — e.g. "open to any other aesthetician", "second choice would be Dr. Mia", "would rather wait for Dr. Sarah".
    - If they're open → no preference; skip the flexibility question.
  • Preferred date (or a day range like "sometime next week") — convert to YYYY-MM-DD using the rules in "Resolving Dates" above before any tool call. Cross-check against Clinic Hours: if that day is CLOSED, push to the next open day before continuing.
  • Preferred time. Two hard rules:
    1. **AM/PM is mandatory.** If the caller says just "9" or "3", you do NOT know if they mean morning or afternoon — ASK: "Just to confirm, 3 in the afternoon?" Don't assume from context. The clinic isn't open at 3am, so silently picking PM is still a habit you must break — confirm it.
    2. **Time must be inside Clinic Hours for that day.** If they ask for a time before open or after close, say so plainly: "We're actually open from [open] to [close] that day — would [closest in-hours time] work, or another day?" Don't pass an out-of-hours time into get_available_slots.

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
Now ask for both — naturally, in the same turn if it flows:
  • Full name. If you only got a first name earlier, ask for the last name now: "And can I get your last name?"
  • Best callback phone number. **A US phone number is exactly 10 digits** (e.g. 555-234-5678). If they include a leading "1" (the country code), drop the 1 — that's not part of the 10-digit number. Treat what they say as a stream of digits: ignore parens, dashes, the words "area code", spaces, and "and" — only count actual digit-words.

Phone-number protocol (do this every time, no exceptions):
  1. After they finish saying it, count the digits in your head. If you have fewer than 10, you're missing some — say "I think I caught only [N] digits — can you say it once more, slowly?" Do NOT try to guess.
  2. If you have more than 10 (e.g. they said "1, 555…"), drop the leading 1.
  3. Read the 10 digits back in 3-3-4 grouping, one digit at a time: "Let me make sure — five-five-five, two-three-four, five-six-seven-eight, is that right?" Never read them as full numbers like "five fifty-five" — always single digits.
  4. If they correct any part, write down the new digits and read the FULL 10-digit number back again from scratch. Repeat until they confirm.
  5. Only after they say "yes that's right" (or equivalent), pass it to book_appointment as a 10-digit string.

Common pitfalls to watch for:
  • They say "my number is the same as the one I'm calling from" → use the caller's incoming number; still read it back to confirm.
  • They give a number with an extension ("555-234-5678 extension 12") → ignore the extension, just keep the 10 digits.
  • They mumble or two digits run together → ALWAYS re-ask if you're not certain you heard 10 distinct digits.

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
    const defaultAmount = bookingConfig.deposit_amount;
    const serviceOverrides: Array<{ service: string; amount: number }> = Array.isArray(
      bookingConfig.deposit_by_service
    )
      ? bookingConfig.deposit_by_service
      : [];

    const overrideLines = serviceOverrides
      .filter((r) => r?.service && Number(r.amount) > 0)
      .map((r) => `  • ${r.service}: $${r.amount}`)
      .join("\n");

    depositInstruction = `- MANDATORY: For all new consultations or appointments, you MUST offer to text a secure payment link to secure the spot.
- Default deposit: $${defaultAmount}.${
      overrideLines
        ? `
- Per-service overrides (match case-insensitive; if the caller's requested service contains one of these names, use its amount instead of the default):
${overrideLines}`
        : ""
    }
- Phrase it like: "To secure your appointment, we collect a $[AMOUNT] deposit which goes toward your treatment. Can I text a secure payment link to this number now?"
- If they agree, immediately call the 'create_payment_link' tool with the matched amount and a description like "[Service] Deposit".`;
  }

  // Payment methods — AI mentions/texts enabled methods when the caller
  // asks about payment options or wants financing. Dynamic Stripe payment
  // links go through create_payment_link; everything else is AI-mentioned
  // or texted via send_sms with the configured handle/URL.
  const paymentMethods = bookingConfig?.payment_methods as
    | Record<string, { enabled?: boolean; [k: string]: unknown }>
    | undefined;
  const enabledMethods: string[] = [];
  if (paymentMethods) {
    const methodLabels: Record<string, (m: any) => string> = {
      stripe: () => "Credit/debit card (via Stripe payment link — use create_payment_link tool)",
      square: (m) =>
        m.payment_link_url
          ? `Square payment link: ${m.payment_link_url} (text via send_sms when requested)`
          : "Square",
      paypal: (m) => (m.handle ? `PayPal @${m.handle}` : "PayPal"),
      venmo: (m) => (m.handle ? `Venmo @${m.handle}` : "Venmo"),
      zelle: (m) => (m.handle ? `Zelle (${m.handle})` : "Zelle"),
      cash: () => "Cash (in-person only)",
      care_credit: (m) =>
        m.application_url
          ? `CareCredit medical financing — application: ${m.application_url} (offer + text for cost-sensitive callers)`
          : "CareCredit medical financing (offer for cost-sensitive callers)",
      cherry: (m) =>
        m.application_url
          ? `Cherry aesthetic financing — application: ${m.application_url} (offer + text for cost-sensitive callers)`
          : "Cherry aesthetic financing (offer for cost-sensitive callers)",
    };
    for (const [key, val] of Object.entries(paymentMethods)) {
      if (val?.enabled && methodLabels[key]) {
        enabledMethods.push(methodLabels[key](val));
      }
    }
  }
  const paymentMethodsBlock = enabledMethods.length
    ? `\n## Payment Methods Accepted\n${enabledMethods.map((m) => `- ${m}`).join("\n")}\nWhen callers ask "how can I pay?" or about specific methods, answer from this list. When they pick a non-Stripe method that has a link/handle, offer to text it via send_sms.\n`
    : "";

  // Always-available clinic facts. Short-and-frequent info goes in the
  // prompt instead of the KB so the AI doesn't have to tool-call for it.
  const bc = tenant.booking_config as any;
  const paymentPolicy = bc?.payment_policy_notes?.trim();
  const directions = tenant.directions_parking_info?.trim();
  const membershipEnabled = Boolean(bc?.membership_enabled);
  const membershipDetails = bc?.membership_details?.trim();
  const membershipSignupUrl = bc?.membership_signup_url?.trim();
  const bookingConstraints = bc?.booking_constraints?.trim();
  const intakeFormEnabled = Boolean(bc?.intake_form_enabled);
  const intakeFormUrl = bc?.intake_form_url?.trim();

  const locationBlock = directions
    ? `\n## Location & Parking\n${directions}\nWhen callers ask "where are you?" or about parking, answer directly using this info.\n`
    : "";

  const paymentBlock = paymentPolicy
    ? `\n## Payment & Billing Guidance\n${paymentPolicy}\nWhen callers ask about cost, financing, or payment methods, follow this guidance. For longer policy questions (refunds, detailed pricing), you may still need to use search_knowledge_base.\n`
    : "";

  const membershipBlock =
    membershipEnabled && membershipDetails
      ? `\n## Membership Program\n${membershipDetails}\n${
          membershipSignupUrl
            ? `Signup link: ${membershipSignupUrl}\n`
            : ""
        }When cost, loyalty, or returning-client topics come up — especially if the caller sounds like they'd be a fit — warmly mention the membership. If they're interested, offer to text them the signup link via the send_sms tool. Don't push; one mention is enough unless they ask for more.\n`
      : "";

  // Plain-English booking constraints — equipment/room/scheduling rules
  // the platform can't enforce on its own. The AI checks these before
  // confirming a slot. Stand-in for full resource modeling.
  const bookingConstraintsBlock = bookingConstraints
    ? `\n## Booking Constraints\nBefore confirming any slot, check these rules:\n${bookingConstraints}\nIf a requested slot would violate one, propose the next compatible time. Don't confirm a booking that breaks a constraint.\n`
    : "";

  // Intake form awareness — the URL itself goes out via SMS post-booking
  // (see lib/intake-form.ts). The AI just needs to know to mention it
  // when callers ask about pre-visit paperwork.
  const intakeFormBlock =
    intakeFormEnabled && intakeFormUrl
      ? `\n## Intake Forms\nAfter every booking, we automatically text the caller a link to our intake form. When they ask about paperwork, what to bring, or pre-appointment prep, confirm the form will arrive by text shortly and they should fill it out before arriving. Don't read the URL out loud — the SMS handles delivery.\n`
      : "";

  return `You are a friendly, professional AI Clientele Specialist for ${tenant.name}, a med spa business.

## Your Role
- Answer questions about services, pricing, and appointments
- Help customers book appointments
- Provide information about policies and procedures
- Escalate complex medical questions to human staff

## Today's Date & Time (Pacific)
- Right now: ${todayLong}, ${timeStr}
- TODAY = ${todayYmd} (${todayWeekday})
- TOMORROW = ${tomorrowYmd} (${tomorrowWeekday})

## Resolving Dates the Caller Says
Always convert the caller's words into a real YYYY-MM-DD before any tool call. Use TODAY above as your anchor. Examples (anchored to today = ${todayYmd}):
- "today" → ${todayYmd}
- "tomorrow" → ${tomorrowYmd}
- "this Friday" / "next Friday" → the upcoming Friday after ${todayYmd}; if today IS Friday, "this Friday" = today, "next Friday" = 7 days later.
- "next week" / "sometime next week" → pick a sensible weekday in the week of (${todayYmd} + 7 days) and confirm with the caller.
- "the 15th" → the next 15th on or after ${todayYmd}.

If you're unsure which date the caller means, briefly read it back: "Just to confirm — Wednesday the 12th, is that right?" Never pass a relative phrase like "tomorrow" into get_available_slots or book_appointment — always pass YYYY-MM-DD.
${callerContext}${providerRoster}${serviceDurationsBlock}${businessHoursBlock}${locationBlock}${paymentMethodsBlock}${paymentBlock}${membershipBlock}${bookingConstraintsBlock}${intakeFormBlock}
## Remembering the Caller
When the caller naturally shares information that would help us serve them better next time — their full name, email address, who referred them, a provider they want to stick with, a time-of-day preference, or something we should remember (e.g. an allergy or that they prefer texts) — call the 'update_client_profile' tool with their phone number and the relevant fields. Do this silently, in the background; don't announce that you're "saving" anything. Never interrogate them for profile fields — only capture what they volunteer.

When capturing an **email address**, never trust what STT gives you on first try — emails are full of letters that sound alike (m/n, b/d/p, s/f). Protocol:
  1. Treat "at" as "@" and "dot" as ".". Strip spaces.
  2. Read it back letter-by-letter, slowly: "Let me confirm — that's L-I-L-Y, at, G-M-A-I-L, dot, C-O-M, lily@gmail.com. Did I get that right?"
  3. If they correct any character, re-read the FULL address letter-by-letter again from scratch.
  4. Only after they confirm, pass it into update_client_profile.
${forwardInstruction}
## How to Talk (this is a phone call, not a brochure)
- Keep replies SHORT — 1–2 sentences by default. Long monologues feel robotic over the phone.
- Answer the literal question first, then offer "Want me to walk through pricing / aftercare / who does it?" — let the caller pull more if they want it.
- When asked about a service (e.g. "tell me about Botox"), give one warm sentence on what it is and one short sentence on the typical use case. Do NOT proactively list pricing, durations, downtime, contraindications, or every detail you know. If they want price, they'll ask.
- When asked about pre-care or aftercare, give the 1–2 most important rules (e.g. "Skip alcohol for 24 hours and no strenuous workouts that day"). Don't read a full checklist unless they ask "what else?"
- Speak naturally, no markdown, no bullet lists out loud, no headings.
- NEVER tell the caller you "don't have" some internal thing. Banned phrases: "knowledge base", "database", "system", "records", "list", "tool", "prompt", "tenant", "calendar event", "AI", "model", "I don't have access to…", "I don't have information on…", "my system doesn't have…", "I'm not able to look that up". These all sound robotic and break the human feel. Instead, just say warmly: "Let me have someone from our team text or call you back on that — what's the best way to reach you?" or "I want to make sure you get the right answer on that — let me have [the team / the front desk] follow up with you." This applies to ANY topic — provider intros, pricing you can't verify, policies, hours on a specific date, anything.
- If a tool returns a long block of info, summarize it in one or two sentences before speaking. Don't read it verbatim.
- If you don't have specific info, offer to have a team member text or call back rather than guessing.
- Never make up prices, services, providers, or hours.
- For booking requests, follow the workflow above (name early, then service / provider / date / time).
${depositInstruction}
- For any other payments or billing questions, use the create_payment_link tool as well

${consentBlock}
${tenant.system_prompt_override ? `## Special Instructions\n${tenant.system_prompt_override}\n` : ""}

## Knowledge Base
${kbContext || "Use the search_knowledge_base tool to find information about services and policies."}
`;
}
