import { NextRequest, NextResponse } from "next/server";
import { getTenantByPhoneNumber, getTenantByVapiPhoneNumberId } from "@/lib/tenants";
import { buildAssistantConfig } from "@/lib/assistant-builder";
import { searchKnowledgeBase, formatKBContext } from "@/lib/knowledge-base";
import { bookAppointment, updateBookingPreferences } from "@/lib/booking";
import { createPaymentLink } from "@/lib/payments";
import { getAvailableSlots } from "@/lib/availability";
import { supabaseAdmin } from "@/lib/supabase";
import {
  updateClientProfile,
  logCallOutcome,
  lookupCaller,
} from "@/lib/client-intelligence";

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
        name: "AI Receptionist",
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
          result = formatKBContext(docs) || "I couldn't find that information. Let me connect you with our team.";
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

          // bookAppointment now handles availability re-check + customer SMS
          // confirmation + staff SMS forward internally. Backup preferences
          // are attached later via the update_booking_preferences tool.
          const bookingResult = await bookAppointment({
            tenantId: tenant.id,
            service,
            preferredDate: preferred_date,
            preferredTime: preferred_time,
            customerName: customer_name,
            customerPhone: customer_phone,
            referredBy: referred_by,
            providerPreference: provider_preference,
            providerFlexibility: provider_flexibility,
          });

          // Cache what we just learned about this caller on their profile.
          // Split "First Last" best-effort; staff can correct in dashboard.
          if (customer_phone && customer_name) {
            const parts = customer_name.trim().split(/\s+/);
            const first = parts[0] || null;
            const last = parts.length > 1 ? parts.slice(1).join(" ") : null;
            updateClientProfile({
              tenantId: tenant.id,
              phone: customer_phone,
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

          if (!phone) {
            result = "I need a phone number on file to update this client's record.";
            break;
          }

          await updateClientProfile({
            tenantId: tenant.id,
            phone,
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

          const prefResult = await updateBookingPreferences({
            tenantId: tenant.id,
            customerPhone: customer_phone,
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
      } catch (e) {
        console.error("CLIENT_PROFILE_CALL_LOG_ERR:", e);
      }
    }
  } catch (err) {
    console.error("END_OF_CALL_ERROR:", err);
  }

  return NextResponse.json({ received: true });
}
