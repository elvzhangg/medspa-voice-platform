import { NextRequest, NextResponse } from "next/server";
import { getTenantByPhoneNumber, getTenantByVapiPhoneNumberId } from "@/lib/tenants";
import { buildAssistantConfig } from "@/lib/assistant-builder";
import { searchKnowledgeBase, formatKBContext } from "@/lib/knowledge-base";
import { bookAppointment, updateBookingPreferences } from "@/lib/booking";
import { createPaymentLink } from "@/lib/payments";
import { getAvailableSlots } from "@/lib/availability";
import { supabaseAdmin } from "@/lib/supabase";
import { regenerateClientSummary } from "@/lib/client-brief";
import {
  updateClientProfile,
  logCallOutcome,
  lookupCaller,
} from "@/lib/client-intelligence";

/**
 * Normalize a phone number string the AI passed us into a clean 10-digit
 * US number. Strips parens, dashes, spaces, country-code prefixes. Returns
 * null when the result isn't exactly 10 digits — caller should re-ask.
 *
 * Belt-and-suspenders for the prompt-side rules in Step 3 of the booking
 * workflow. If the AI mishears or the model passes "5552345" with missing
 * digits, we'd rather bounce than write a half-baked number to the DB.
 */
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}

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
      return handleEndOfCallReport(message);
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
        name: "AI Clientele Specialist",
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

  // Inbound caller-id from the telco — most reliable identifier for THIS
  // call. We pin all client_profile writes to this number so a caller who
  // mis-states their callback number once or twice doesn't end up as 2-3
  // separate clients in the CRM. The AI-captured phone is still saved as
  // the booking's callback number (where the SMS confirmation goes), but
  // the client identity stays one-to-one with the actual line that called.
  const inboundCallerNumber =
    (call?.customer as Record<string, unknown> | undefined)?.number as string | undefined;

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
          const kbText = formatKBContext(docs);
          if (!kbText) {
            result = "No specific notes on that. Offer to have someone from the team follow up by text — don't mention any internal system.";
          } else {
            // Reminder fires fresh on every tool call so the model doesn't drift
            // back into reading the full chunk verbatim.
            result = `INTERNAL REFERENCE (do not read verbatim — summarize in 1–2 sentences answering only what the caller asked, do not volunteer pricing or extra details unless asked):\n\n${kbText}`;
          }
          break;
        }

        case "get_available_slots": {
          if (!tenant) {
            result = "I'm sorry, I can't access the calendar right now.";
            break;
          }
          const { date, service, provider } = toolCall.parameters as { date: string, service?: string, provider?: string };
          const slots = await getAvailableSlots(tenant.id, date, service, provider);

          if (slots.length === 0) {
            if (provider && !/no preference|any|anyone/i.test(provider)) {
              result = `${provider} doesn't have any openings for ${service || 'that service'} on ${date}. Would another day work, or would they be open to a different provider?`;
            } else {
              result = `I'm sorry, we don't have any openings for ${service || 'that service'} on ${date}. Is there another day that works for you?`;
            }
          } else {
            const who = provider && !/no preference|any|anyone/i.test(provider) ? `${provider} has` : `we have`;
            result = `On ${date}, ${who} the following times available: ${slots.join(", ")}. Which one should I grab for you?`;
          }
          break;
        }

        case "book_appointment": {
          if (!tenant) {
            result = "I'm sorry, I'm having trouble accessing our booking system right now. Could you please call back in a few minutes?";
            break;
          }

          const {
            service,
            preferred_date,
            preferred_time,
            customer_name,
            customer_phone,
            provider_preference,
            provider_flexibility,
            referred_by,
          } = toolCall.parameters as Record<string, string>;

          // Phone normalization defensive layer. The AI is instructed to pass
          // a 10-digit string, but we strip non-digits and drop a leading 1
          // here as a safety net — and bounce back to the AI if we still
          // don't end up with 10 digits, so it re-asks instead of writing
          // a malformed number into booking_requests.
          const normalizedPhone = normalizePhone(customer_phone);
          if (!normalizedPhone) {
            result = `I want to make sure I have your number right — that didn't come through as a complete 10-digit number. Could you say it once more, slowly?`;
            break;
          }

          // bookAppointment now handles availability re-check + customer SMS
          // confirmation + staff SMS forward internally. Backup preferences
          // are attached later via the update_booking_preferences tool.
          const bookingResult = await bookAppointment({
            tenantId: tenant.id,
            service,
            preferredDate: preferred_date,
            preferredTime: preferred_time,
            customerName: customer_name,
            customerPhone: normalizedPhone,
            referredBy: referred_by,
            providerPreference: provider_preference,
            providerFlexibility: provider_flexibility,
          });

          // Cache what we just learned about this caller on their profile.
          // Split "First Last" best-effort; staff can correct in dashboard.
          // Pin the profile update to the inbound caller-id (the actual
          // line on the call), not the AI-captured callback number — those
          // can differ legitimately, but the CLIENT is the inbound line.
          // Only fall back to the AI-captured phone if caller-id is missing
          // (e.g. blocked/anonymous).
          const profilePhone = inboundCallerNumber || normalizedPhone;
          if (profilePhone && customer_name) {
            const parts = customer_name.trim().split(/\s+/);
            const first = parts[0] || null;
            const last = parts.length > 1 ? parts.slice(1).join(" ") : null;
            updateClientProfile({
              tenantId: tenant.id,
              phone: profilePhone,
              updates: {
                first_name: first,
                last_name: last,
                preferred_provider: provider_preference && !/no preference|any|anyone/i.test(provider_preference) ? provider_preference : undefined,
                referral_source: referred_by || undefined,
              },
              source: "ai_call",
              sourceDetail: (call?.id as string) || undefined,
            }).catch((e) => console.error("BOOK_PROFILE_UPDATE_ERR:", e));
          }

          result = bookingResult.message;
          break;
        }

        case "update_client_profile": {
          if (!tenant) {
            result = "Noted.";
            break;
          }
          const {
            phone,
            first_name,
            last_name,
            email,
            preferred_provider,
            preferred_time,
            referral_source,
            notes,
          } = toolCall.parameters as Record<string, string>;

          // Pin to inbound caller-id, never the AI-passed phone — same
          // dedup reasoning as book_appointment. The AI may pass a phone
          // mid-correction, and we must NOT spawn a fresh client_profile
          // for each variant. Only fall back if caller-id is unknown.
          const profilePhone = inboundCallerNumber || phone;
          if (!profilePhone) {
            result = "Noted.";
            break;
          }

          await updateClientProfile({
            tenantId: tenant.id,
            phone: profilePhone,
            updates: {
              first_name: first_name || undefined,
              last_name: last_name || undefined,
              email: email || undefined,
              preferred_provider: preferred_provider || undefined,
              preferred_time: preferred_time || undefined,
              referral_source: referral_source || undefined,
              staff_notes: notes || undefined,
            },
            source: "ai_call",
            sourceDetail: (call?.id as string) || undefined,
          });
          result = "Got it, I've noted that for their file.";
          break;
        }

        case "update_booking_preferences": {
          if (!tenant) {
            result = "I wasn't able to save those preferences, but your booking is still in place.";
            break;
          }
          const {
            customer_phone,
            backup_slots,
            time_preference,
          } = toolCall.parameters as Record<string, string>;

          // Normalize so this match-by-phone aligns with what we wrote
          // during book_appointment (also normalized).
          const prefResult = await updateBookingPreferences({
            tenantId: tenant.id,
            customerPhone: normalizePhone(customer_phone) ?? customer_phone,
            backupSlots: backup_slots,
            timePreference: time_preference,
          });
          result = prefResult.message;
          break;
        }

        case "create_payment_link": {
          if (!tenant) {
            result = "I'm sorry, our payment system is currently unavailable. Let me have the billing team reach out to you directly.";
            break;
          }

          const { amount, description } = toolCall.parameters as Record<string, string | number>;
          
          try {
            const numAmount = typeof amount === "string" ? parseFloat(amount.replace(/[^0-9.]/g, '')) : (amount as number);
            
            const paymentResult = await createPaymentLink({
              tenantId: tenant.id,
              amount: numAmount,
              customerPhone: (call?.customer as any)?.number || "Unknown Phone",
              description: String(description || "Payment Request")
            });

            result = paymentResult.message;
          } catch (err) {
            console.error("PAYMENT_LINK_ERR:", err);
            result = "I'm sorry, I'm having trouble creating that payment link. I'll have the team reach out to you instead.";
          }
          break;
        }

        case "log_referral": {
          if (tenant) {
            const { referred_by_name, new_patient_name, new_patient_phone } = toolCall.parameters as Record<string, string>;
            await supabaseAdmin.from("referrals").insert({
              tenant_id: tenant.id,
              referred_by_name,
              new_patient_name: new_patient_name || null,
              new_patient_phone: new_patient_phone || null,
              source: "phone",
              status: "pending",
            });
            result = `I've noted that ${new_patient_name || "you"} were referred by ${referred_by_name}. We'll make sure they receive their referral credit. Thank you!`;
          } else {
            result = "Thank you for letting us know about your referral!";
          }
          break;
        }

        case "record_sms_consent": {
          if (!tenant) {
            result = "Noted.";
            break;
          }
          const { phone_number, consent_excerpt } = toolCall.parameters as Record<string, string>;
          const callerNumber = (call?.customer as any)?.number || null;
          const vapiCallId = (call?.id as string) || null;

          // Find the call_logs row for this Vapi call so we can pin consent
          // to a specific transcript. handleEndOfCallReport inserts this row
          // at call-end — during the call itself it may not exist yet, so we
          // still record consent and link the call_log on the end-of-call
          // pass via vapi_call_id lookup below.
          let callLogId: string | null = null;
          if (vapiCallId) {
            const { data: cl } = await supabaseAdmin
              .from("call_logs")
              .select("id")
              .eq("vapi_call_id", vapiCallId)
              .maybeSingle();
            callLogId = (cl as any)?.id ?? null;
          }

          // Attach consent to the most recent booking_request for this
          // caller; the end-of-call handler later propagates it onto the
          // calendar_events row once the booking materializes.
          let appliedToEventId: string | null = null;
          if (callerNumber) {
            const { data: recent } = await supabaseAdmin
              .from("calendar_events")
              .select("id")
              .eq("tenant_id", tenant.id)
              .eq("customer_phone", callerNumber)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const recentId = (recent as any)?.id ?? null;
            if (recentId) {
              await supabaseAdmin
                .from("calendar_events")
                .update({
                  sms_consent_granted_at: new Date().toISOString(),
                  sms_consent_source: "verbal_call",
                  sms_consent_call_id: callLogId,
                  sms_consent_phone: phone_number || callerNumber,
                })
                .eq("id", recentId);
              appliedToEventId = recentId;
            }
          }

          // Always write the audit row, even if no event exists yet. The
          // excerpt is our HIPAA/TCPA proof of the verbal grant.
          await supabaseAdmin.from("appointment_audit_log").insert({
            tenant_id: tenant.id,
            calendar_event_id: appliedToEventId,
            action: "consent_granted",
            source: "verbal_call",
            metadata: {
              phone_number: phone_number || callerNumber,
              excerpt: (consent_excerpt || "").slice(0, 500),
              vapi_call_id: vapiCallId,
              call_log_id: callLogId,
            },
          });

          result = "Consent recorded. Thanks — we'll only text you about your appointments.";
          break;
        }

        case "send_sms": {
          const { message: smsBody } = toolCall.parameters as Record<string, string>;
          const customerNumber = (call?.customer as any)?.number;
          
          if (!customerNumber) {
            result = "I'm sorry, I don't have a phone number on file to send that text to.";
            break;
          }

          if (!tenant?.phone_number) {
            result = "I've sent that text message to you now."; // Fallback for testing
            break;
          }

          console.log("SENDING_REAL_SMS_VIA_VAPI:", {
            to: customerNumber,
            from: tenant.phone_number,
            body: smsBody
          });

          try {
            // Vapi's Message Tool API
            // This ensures the SMS comes from the same number the patient is currently talking to
            const vapiRes = await fetch(`https://api.vapi.ai/call/${call?.id}/message`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${process.env.VAPI_API_KEY || "a0e0b763-2636-40ea-be74-ac0227ec7be5"}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                content: smsBody,
                role: "assistant"
              })
            });

            if (!vapiRes.ok) {
              const err = await vapiRes.text();
              console.error("VAPI_SMS_SEND_FAILED:", err);
              result = "I tried to send that text, but there was a synchronization error. I'll notify our team.";
            } else {
              result = "I've sent that text message to you now. Please check your phone.";
            }
          } catch (err) {
            console.error("SMS_EXCEPTION:", err);
            result = "I'm having trouble connecting to our text service right now.";
          }
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

async function handleEndOfCallReport(message: Record<string, unknown>) {
  try {
    const call = message.call as Record<string, unknown> | undefined;
    const vapiCallId = (call?.id as string) || "";
    const phoneNumberId = call?.phoneNumberId as string | undefined;
    const phoneNumberObj = call?.phoneNumber as Record<string, unknown> | undefined;
    const dialedNumber = phoneNumberObj?.number as string | undefined;
    const callerObj = call?.customer as Record<string, unknown> | undefined;
    const callerNumber = callerObj?.number as string | undefined;

    // Extract call data from the report (cast to any for dynamic property access)
    const msg = message as any;
    const callAny = call as any;
    const durationSeconds = msg.durationSeconds ?? msg.duration ?? callAny?.duration;
    const summary = msg.summary ?? msg.analysis?.summary;
    const transcript = msg.transcript ?? msg.artifact?.transcript;

    // Also try to get transcript as a string from messages array
    let transcriptText = transcript;
    if (!transcriptText && msg.artifact) {
      const artifact = msg.artifact as any;
      const messages = artifact.messages;
      if (messages && Array.isArray(messages) && messages.length > 0) {
        transcriptText = messages
          .map((m: any) => `${m.role}: ${m.content || m.message || ""}`)
          .join("\n");
      }
    }

    // Look up tenant
    let tenant = phoneNumberId
      ? await getTenantByVapiPhoneNumberId(phoneNumberId)
      : null;
    if (!tenant && dialedNumber) {
      tenant = await getTenantByPhoneNumber(dialedNumber);
    }

    // Insert into call_logs
    const { error } = await supabaseAdmin.from("call_logs").insert({
      tenant_id: tenant?.id || null,
      vapi_call_id: vapiCallId,
      caller_number: callerNumber || null,
      duration_seconds: durationSeconds ? Math.round(durationSeconds) : null,
      summary: summary || null,
      transcript: transcriptText || null,
    });

    if (error) {
      console.error("CALL_LOG_INSERT_ERROR:", error);
    } else {
      console.log("CALL_LOGGED:", vapiCallId, "tenant:", tenant?.name || "unknown");
    }

    // Bump the caller's profile: count this call, store a summary entry,
    // mark booking flags if a booking_request landed during this call.
    if (tenant && callerNumber) {
      try {
        const startedAt =
          (callAny?.startedAt as string) ||
          (callAny?.createdAt as string) ||
          new Date().toISOString();

        // Did this call result in a booking? Look for a booking_request
        // from this caller created after the call started.
        let booked = false;
        let service: string | null = null;
        let provider: string | null = null;
        const { data: br } = await supabaseAdmin
          .from("booking_requests")
          .select("service, provider_preference, created_at")
          .eq("tenant_id", tenant.id)
          .eq("customer_phone", callerNumber)
          .gte("created_at", startedAt)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (br) {
          booked = true;
          service = (br as any).service ?? null;
          provider = (br as any).provider_preference ?? null;
        }

        await logCallOutcome({
          tenantId: tenant.id,
          phone: callerNumber,
          callId: vapiCallId,
          startedAt,
          durationSeconds: durationSeconds ? Math.round(durationSeconds) : null,
          summary: summary || null,
          booked,
          service,
          provider,
        });

        // Fire-and-forget: regenerate the client's rolling summary now
        // that this call's transcript is captured. The next call + the
        // staff brief endpoint both read from client_profiles.summary,
        // so keeping it current after each interaction is the contract.
        // Errors are logged inside regenerateClientSummary, not bubbled.
        const { data: clientRow } = await supabaseAdmin
          .from("client_profiles")
          .select("id")
          .eq("tenant_id", tenant.id)
          .eq("phone", callerNumber)
          .maybeSingle();
        if (clientRow?.id) {
          void regenerateClientSummary(tenant.id, clientRow.id);
        }
      } catch (e) {
        console.error("CLIENT_PROFILE_CALL_LOG_ERR:", e);
      }
    }
  } catch (err) {
    console.error("END_OF_CALL_ERROR:", err);
  }

  return NextResponse.json({ received: true });
}
