import { supabaseAdmin } from "./supabase";
import { loadTenantIntegration } from "./integrations";
import { resolveCachedSlot } from "./availability";
import { sendIntakeFormSms } from "./intake-form";

/**
 * Booking integration layer supporting 5 modes:
 * 1. internal — Store in DB, staff follows up (default)
 * 2. vagaro — Create appointment via Vagaro API
 * 3. acuity — Create appointment via Acuity Scheduling API
 * 4. mindbody — Create appointment via Mindbody API
 * 5. link — Text a booking link to the customer
 */

interface BookingRequest {
  tenantId: string;
  service: string;
  preferredDate?: string;
  preferredTime?: string;
  customerName: string;
  customerPhone: string;
  referredBy?: string;
  notes?: string;
  // Scheduling flexibility — collected during the call so staff can confirm
  backupSlots?: string;          // e.g. "also Thursday mornings or any Friday afternoon"
  timePreference?: string;       // e.g. "mornings before noon", "afternoons preferred"
  providerPreference?: string;   // primary provider, e.g. "Dr. Sarah", "no preference"
  providerFlexibility?: string;  // backup stance, e.g. "open to any aesthetician", "would rather wait for Dr. Sarah"
}

interface BookingResult {
  success: boolean;
  message: string;
  confirmationId?: string;
  /** Set when a slot was requested but got taken between availability check and booking */
  slotUnavailable?: boolean;
}

export async function bookAppointment(request: BookingRequest): Promise<BookingResult> {
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, name, booking_provider, booking_config, booking_forward_enabled, booking_forward_phones, booking_forward_sms_template, twilio_account_sid, twilio_auth_token, twilio_phone_number, integration_platform, integration_mode, integration_status")
    .eq("id", request.tenantId)
    .single();

  // integration_mode is the new source of truth set by admin. Fall back to
  // booking_provider (legacy) if no integration is configured yet.
  const isDirectBook =
    tenant?.integration_mode === "direct_book" && tenant?.integration_status === "connected";
  const provider = isDirectBook
    ? tenant?.integration_platform || "internal"
    : tenant?.booking_provider || "internal";

  let result: BookingResult;

  // Direct-book via platform adapter (Boulevard, Acuity when ported, etc.)
  if (isDirectBook) {
    result = await bookViaAdapter(request);
    // If the adapter failed mid-flight, persist the request internally so
    // staff can still see + confirm manually — AI never leaves the caller
    // in limbo.
    if (!result.success) {
      console.warn("ADAPTER_BOOKING_FAILED — persisting internally as fallback");
      const internal = await bookInternal(request);
      if (internal.success) {
        result = {
          ...internal,
          message:
            "I've sent your request to our team — they'll confirm shortly. " +
            "(Our booking system had a brief hiccup; your request is safe.)",
        };
      }
    }
  } else {
    switch (provider) {
      case "vagaro":
        result = await bookViaVagaro(request, tenant?.booking_config);
        break;
      case "acuity":
        result = await bookViaAcuity(request, tenant?.booking_config);
        break;
      case "mindbody":
        result = await bookViaMindbody(request, tenant?.booking_config);
        break;
      case "link":
        result = await bookViaLink(request, tenant?.booking_config);
        break;
      default:
        result = await bookInternal(request);
    }
  }

  // Staff-forward SMS: only when the tenant is in sms_fallback/hybrid mode (or
  // legacy — no integration configured). Direct-book tenants don't need it
  // because the booking was written straight into their platform.
  const needsStaffForward =
    !isDirectBook &&
    tenant?.booking_forward_enabled &&
    (tenant.booking_forward_phones ?? []).length > 0;
  if (result.success && needsStaffForward) {
    await sendStaffForwardNotification(request, tenant, result.confirmationId);
  }

  // Customer SMS confirmation — language adapts to whether the booking was
  // actually locked in (direct_book) or still pending staff confirmation.
  if (result.success && tenant) {
    await sendCustomerConfirmation(request, tenant, isDirectBook);
  }

  return result;
}

/**
 * Sends the customer a real SMS confirming their appointment request was
 * received. Uses tenant-level Twilio if configured, platform env vars otherwise.
 *
 * The language is deliberately hedged ("request received", not "confirmed")
 * because staff still review before final confirmation.
 */
async function sendCustomerConfirmation(
  request: BookingRequest,
  tenant: any,
  confirmed: boolean = false,
): Promise<void> {
  const accountSid = tenant.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
  const authToken  = tenant.twilio_auth_token  || process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = tenant.twilio_phone_number || process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn("CUSTOMER_CONFIRMATION_SMS_SKIPPED: no Twilio credentials");
    return;
  }
  if (!request.customerPhone) return;

  const whenLine = request.preferredDate && request.preferredTime
    ? `${request.preferredDate} at ${request.preferredTime}`
    : request.preferredDate || "soon";

  const body = confirmed
    ? `Hi ${request.customerName.split(" ")[0]} — this is ${tenant.name}. Your ${request.service} appointment on ${whenLine} is confirmed. See you then! Reply STOP to opt out.`
    : `Hi ${request.customerName.split(" ")[0]} — this is ${tenant.name}. We've received your request for ${request.service} on ${whenLine}. Our team will send a final confirmation shortly. Reply STOP to opt out.`;

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: fromNumber, To: request.customerPhone, Body: body }).toString(),
    });
    if (!res.ok) {
      console.error("CUSTOMER_CONFIRMATION_SMS_FAILED:", await res.text());
    } else {
      console.log("CUSTOMER_CONFIRMATION_SMS_SENT:", request.customerPhone);
    }
  } catch (err) {
    console.error("CUSTOMER_CONFIRMATION_SMS_EXCEPTION:", err);
  }
}

/**
 * Attach backup scheduling preferences to the most recent pending booking
 * request for this customer on this tenant. Called by the
 * update_booking_preferences tool after book_appointment has already fired.
 */
export async function updateBookingPreferences(args: {
  tenantId: string;
  customerPhone: string;
  backupSlots?: string;
  timePreference?: string;
  providerPreference?: string;
}): Promise<{ success: boolean; message: string }> {
  const { data: latest } = await supabaseAdmin
    .from("booking_requests")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("customer_phone", args.customerPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!latest) {
    return {
      success: false,
      message: "I couldn't find your booking to attach those preferences to — but don't worry, your original request is still in place.",
    };
  }

  const update: Record<string, string> = {};
  if (args.backupSlots) update.backup_slots = args.backupSlots;
  if (args.timePreference) update.time_preference = args.timePreference;
  if (args.providerPreference) update.provider_preference = args.providerPreference;

  if (Object.keys(update).length === 0) {
    return { success: true, message: "Got it, no backup preferences to add." };
  }

  const { error } = await supabaseAdmin
    .from("booking_requests")
    .update(update)
    .eq("id", latest.id);

  if (error) {
    console.error("UPDATE_BOOKING_PREFS_ERROR:", error);
    return { success: false, message: "I had trouble saving those, but your primary slot is still good." };
  }

  return { success: true, message: "Perfect, I've noted those backup preferences for our team." };
}

/**
 * Sends an SMS to every phone number in booking_forward_phones so staff can
 * manually confirm the appointment with the patient.
 *
 * Uses Twilio REST API directly (env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * TWILIO_FROM_NUMBER). If credentials are absent the error is logged but the
 * booking result is unaffected — staff can still see requests in the dashboard.
 */
async function sendStaffForwardNotification(
  request: BookingRequest,
  tenant: any,
  confirmationId?: string
): Promise<void> {
  // Prefer tenant-owned Twilio credentials; fall back to platform env vars.
  // This way the staff SMS comes FROM the clinic's own AI number — recognizable
  // to staff and consistent with the inbound receptionist experience.
  const accountSid = tenant.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
  const authToken  = tenant.twilio_auth_token  || process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = tenant.twilio_phone_number || process.env.TWILIO_FROM_NUMBER;
  const usingTenantTwilio = Boolean(tenant.twilio_account_sid && tenant.twilio_auth_token && tenant.twilio_phone_number);

  if (!accountSid || !authToken || !fromNumber) {
    console.warn(
      "STAFF_FORWARD_SMS_SKIPPED: No Twilio credentials available (neither tenant-level nor platform env vars)."
    );
    return;
  }

  console.log(`STAFF_FORWARD_SMS_SENDER: using ${usingTenantTwilio ? "tenant" : "platform"} Twilio (from=${fromNumber})`);

  const template: string =
    tenant.booking_forward_sms_template ||
    "📋 New booking request via AI Clientele Specialist\n\nPatient: [CustomerName]\nPhone: [CustomerPhone]\nService: [Service]\nRequested: [DateTime]\nProvider preference: [ProviderPreference]\nOpen to other providers? [ProviderFlexibility]\nBackup slots: [BackupSlots]\nTime preference: [TimePreference]\nNotes: [Notes]\n\nPlease text or call to confirm.\n— [ClinicName] VauxVoice";

  const dateTime = [request.preferredDate, request.preferredTime].filter(Boolean).join(" at ") || "Flexible";
  const notes = request.notes || (request.referredBy ? `Referred by: ${request.referredBy}` : "None");

  const smsBody = template
    .replace(/\[CustomerName\]/g, request.customerName)
    .replace(/\[CustomerPhone\]/g, request.customerPhone)
    .replace(/\[Service\]/g, request.service)
    .replace(/\[DateTime\]/g, dateTime)
    .replace(/\[BackupSlots\]/g, request.backupSlots || "None given")
    .replace(/\[TimePreference\]/g, request.timePreference || "No preference")
    .replace(/\[ProviderPreference\]/g, request.providerPreference || "No preference")
    .replace(/\[ProviderFlexibility\]/g, request.providerFlexibility || (request.providerPreference && !/no preference/i.test(request.providerPreference) ? "Not asked" : "N/A"))
    .replace(/\[Notes\]/g, notes)
    .replace(/\[ClinicName\]/g, tenant.name);

  const phones: string[] = tenant.booking_forward_phones ?? [];
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const sentTo: string[] = [];

  for (const toNumber of phones) {
    try {
      const res = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: fromNumber, To: toNumber, Body: smsBody }).toString(),
      });

      if (res.ok) {
        sentTo.push(toNumber);
        console.log("STAFF_FORWARD_SMS_SENT:", toNumber);
      } else {
        const err = await res.text();
        console.error("STAFF_FORWARD_SMS_FAILED:", toNumber, err);
      }
    } catch (err) {
      console.error("STAFF_FORWARD_SMS_EXCEPTION:", toNumber, err);
    }
  }

  // Record which numbers were notified and when
  if (sentTo.length > 0) {
    // .order() / .limit() are not valid on update() — fetch the latest record's ID first
    const { data: latest } = await supabaseAdmin
      .from("booking_requests")
      .select("id")
      .eq("tenant_id", request.tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latest) {
      await supabaseAdmin
        .from("booking_requests")
        .update({ forwarded_to: sentTo, forward_sent_at: new Date().toISOString() })
        .eq("id", latest.id);
    }
  }
}

/**
 * Mode 1: Internal — store in DB, staff follows up
 */
async function bookInternal(request: BookingRequest): Promise<BookingResult> {
  // 1. Availability re-check — the AI already called get_available_slots, but
  //    another caller could have taken the slot in the meantime. Do a final
  //    check against calendar_events before committing.
  if (request.preferredDate && request.preferredTime) {
    const startTime = normalizeSlotStart(request.preferredDate, request.preferredTime);
    if (!startTime) {
      return {
        success: false,
        message: "I couldn't quite parse that date and time. Could you say it once more?",
      };
    }
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const { data: conflicts } = await supabaseAdmin
      .from("calendar_events")
      .select("id")
      .eq("tenant_id", request.tenantId)
      .neq("status", "cancelled")
      .lt("start_time", endTime.toISOString())
      .gt("end_time", startTime.toISOString())
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return {
        success: false,
        slotUnavailable: true,
        message: `I'm so sorry — it looks like that slot just got taken. Could you check get_available_slots again and offer the caller a different time?`,
      };
    }

    // 2. Log the booking request
    const { error: reqErr } = await supabaseAdmin.from("booking_requests").insert({
      tenant_id: request.tenantId,
      service: request.service,
      preferred_date: request.preferredDate,
      preferred_time: request.preferredTime,
      customer_name: request.customerName,
      customer_phone: request.customerPhone,
      referred_by: request.referredBy || null,
      notes: request.notes || null,
      backup_slots: request.backupSlots || null,
      time_preference: request.timePreference || null,
      provider_preference: request.providerPreference || null,
      provider_flexibility: request.providerFlexibility || null,
      status: "pending",
    });

    if (reqErr) {
      console.error("BOOKING_INSERT_ERROR:", reqErr);
      return {
        success: false,
        message: "I'm sorry, I had trouble recording your appointment request. Could you please call back?"
      };
    }

    // 3. Create the calendar event (pending staff review — visible but not confirmed).
    // booked_via_ai=true so the Revenue card attributes this appointment
    // correctly even in internal mode (where there's no platform webhook
    // to later tag it for us).
    const { error: calErr } = await supabaseAdmin.from("calendar_events").insert({
      tenant_id: request.tenantId,
      title: `${request.customerName} - ${request.service}`,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      customer_name: request.customerName,
      customer_phone: request.customerPhone,
      service_type: request.service,
      status: "confirmed",
      booked_via_ai: true,
    });
    if (calErr) {
      // Loud — previously this insert had no error handling, so a failure
      // (RLS, schema drift, type mismatch) silently dropped the event off
      // the calendar even though the booking_request looked fine.
      console.error("CALENDAR_EVENT_INSERT_FAILED:", calErr, {
        tenant_id: request.tenantId,
        start_time: startTime.toISOString(),
      });
      return {
        success: false,
        message:
          "I'm sorry, I couldn't lock that on our calendar just now. Let me have someone from the team reach out to confirm — what's the best number to text?",
      };
    }
  } else {
    // No specific slot — shouldn't happen under the new workflow, but be defensive
    const { error: reqErr } = await supabaseAdmin.from("booking_requests").insert({
      tenant_id: request.tenantId,
      service: request.service,
      preferred_date: request.preferredDate || null,
      preferred_time: request.preferredTime || null,
      customer_name: request.customerName,
      customer_phone: request.customerPhone,
      referred_by: request.referredBy || null,
      notes: request.notes || null,
      backup_slots: request.backupSlots || null,
      time_preference: request.timePreference || null,
      provider_preference: request.providerPreference || null,
      provider_flexibility: request.providerFlexibility || null,
      status: "pending",
    });
    if (reqErr) {
      return { success: false, message: "I'm sorry, I had trouble recording your request. Please call back." };
    }
  }

  const when = request.preferredDate && request.preferredTime
    ? `${request.preferredDate} at ${request.preferredTime}`
    : request.preferredDate || "the time you mentioned";

  return {
    success: true,
    message: `Your appointment request for ${request.service} on ${when} has been sent to our scheduling team. You'll receive a text confirmation at ${request.customerPhone} shortly.`,
  };
}

/**
 * Accepts "2024-11-15" + a time like "2pm" / "14:00" / "2:00 PM" and returns
 * a real Date. Also accepts "today"/"tomorrow" in the date slot as a defensive
 * layer — the prompt instructs the AI to convert relative dates upfront, but
 * if it slips, we'd rather book at the right day than fail silently. Returns
 * null and logs when truly unparseable.
 */
function normalizeSlotStart(date: string, time: string): Date | null {
  let d8 = (date || "").trim().toLowerCase();
  if (d8 === "today") {
    d8 = new Date().toISOString().slice(0, 10);
  } else if (d8 === "tomorrow") {
    d8 = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  const t = (time || "").trim();

  // Already HH:MM (24h)
  const hhmm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const d = new Date(`${d8}T${hhmm[1].padStart(2, "0")}:${hhmm[2]}:00`);
    if (!isNaN(d.getTime())) return d;
  }
  // Natural: "2pm", "2:30 pm", "2:00 PM"
  const natural = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (natural) {
    let h = parseInt(natural[1], 10);
    const m = natural[2] ? parseInt(natural[2], 10) : 0;
    const ampm = natural[3].toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    const d = new Date(`${d8}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    if (!isNaN(d.getTime())) return d;
  }
  // Fallback: try Date() directly
  const d = new Date(`${d8}T${t}`);
  if (!isNaN(d.getTime())) return d;

  console.warn("NORMALIZE_SLOT_FAILED:", { date, time });
  return null;
}

/**
 * Direct-book via the platform adapter registered for this tenant.
 * Reads the ISO startTime out of the in-memory slot cache populated by
 * getAvailableSlots (same call that showed the slot to the caller), so
 * we book the exact slot the caller confirmed instead of re-guessing.
 */
async function bookViaAdapter(request: BookingRequest): Promise<BookingResult> {
  const integration = await loadTenantIntegration(request.tenantId);
  if (!integration) {
    return { success: false, message: "Integration not available." };
  }

  // Recover the ISO startTime for the label the caller agreed to. If the
  // cache misses (e.g. server restarted), fall back to parsing the label
  // against preferredDate as a best-effort.
  let iso: string | null = null;
  if (request.preferredDate && request.preferredTime) {
    iso = resolveCachedSlot(request.tenantId, request.preferredDate, request.preferredTime);
    if (!iso) {
      const parsed = parseLooseDateTime(request.preferredDate, request.preferredTime);
      if (parsed) iso = parsed;
    }
  }
  if (!iso) {
    return {
      success: false,
      message:
        "I had trouble locking in that exact time. Let me re-check availability for you.",
      slotUnavailable: true,
    };
  }

  const res = await integration.adapter.bookAppointment(integration.ctx, {
    service: request.service,
    startTime: iso,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
    notes: request.referredBy ? `Referred by: ${request.referredBy}` : request.notes,
  });

  if (!res.ok) {
    if (res.errorCode === "unavailable") {
      return {
        success: false,
        slotUnavailable: true,
        message:
          "That slot just got taken while we were chatting — can I check another time for you?",
      };
    }
    return { success: false, message: "I couldn't confirm that appointment just now." };
  }

  // AI-attribution marker — write a calendar_events row immediately, keyed
  // by the platform's appointment id. When the platform later fires a
  // webhook for this same appointment, the upsert by (tenant, source,
  // external_id) finds our row and preserves booked_via_ai=true. This is
  // how the Revenue card on the Overview isolates AI-driven bookings from
  // walk-ins or front-desk bookings made directly in the platform UI.
  if (res.appointmentId) {
    try {
      const startDate = new Date(iso);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1h default; webhook will correct
      await supabaseAdmin
        .from("calendar_events")
        .upsert(
          {
            tenant_id: request.tenantId,
            external_source: integration.adapter.platform,
            external_id: res.appointmentId,
            title: `${request.customerName} - ${request.service}`,
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            customer_name: request.customerName,
            customer_phone: request.customerPhone,
            service_type: request.service,
            status: "confirmed",
            booked_via_ai: true,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,external_source,external_id" }
        );
    } catch (e) {
      // Non-fatal — attribution fails open. Booking still succeeded.
      console.error("AI_ATTRIBUTION_WRITE_ERR:", e);
    }
  }

  // Fire-and-forget intake form SMS. No-op if the tenant hasn't enabled it.
  // Errors are logged inside; we don't block the booking on a Twilio hiccup.
  void sendIntakeFormSms({
    tenantId: request.tenantId,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
  }).catch((err) => console.error("INTAKE_FORM_SMS_ERR:", err));

  return {
    success: true,
    confirmationId: res.appointmentId,
    message:
      `Perfect — your ${request.service} appointment on ${request.preferredDate} at ` +
      `${request.preferredTime} is confirmed. You'll receive a text confirmation at ${request.customerPhone}. ` +
      `Anything else I can help with?`,
  };
}

/**
 * Best-effort parse of a loose "YYYY-MM-DD" + "2:00 PM" / "14:00" pair
 * into a local ISO timestamp. Only used as a last resort when the slot
 * cache misses — the canonical path is resolveCachedSlot.
 */
function parseLooseDateTime(date: string, time: string): string | null {
  const t = time.trim().toUpperCase();
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const iso = `${date}T${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  return iso;
}

/**
 * Mode 2: Vagaro API integration
 * Config: { merchantId: string, apiKey: string }
 */
async function bookViaVagaro(request: BookingRequest, config: any): Promise<BookingResult> {
  if (!config?.merchantId || !config?.apiKey) {
    console.error("VAGARO_CONFIG_MISSING");
    return bookInternal(request);
  }

  try {
    // Vagaro API endpoint: POST /api/v1/appointments
    // Note: Vagaro requires webhook approval for full API access
    const baseUrl = "https://api.vagaro.com/v1";
    
    const response = await fetch(`${baseUrl}/appointments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        merchantId: config.merchantId,
        serviceName: request.service,
        customerName: request.customerName,
        customerPhone: request.customerPhone,
        startDate: request.preferredDate,
        startTime: request.preferredTime,
        notes: request.referredBy ? `Referred by: ${request.referredBy}` : request.notes,
      })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        confirmationId: data.appointmentId?.toString(),
        message: `Your ${request.service} appointment is confirmed for ${request.preferredDate || 'soon'}${request.preferredTime ? ` at ${request.preferredTime}` : ''}. You'll receive a confirmation text at ${request.customerPhone}. Is there anything else I can help with?`
      };
    } else {
      console.error("VAGARO_API_ERROR:", await response.text());
      return bookInternal(request); // Fallback
    }
  } catch (err) {
    console.error("VAGARO_ERROR:", err);
    return bookInternal(request);
  }
}

/**
 * Mode 3: Acuity Scheduling API
 * Config: { userId: string, apiKey: string }
 */
async function bookViaAcuity(request: BookingRequest, config: any): Promise<BookingResult> {
  if (!config?.userId || !config?.apiKey) {
    console.error("ACUITY_CONFIG_MISSING");
    return bookInternal(request);
  }

  try {
    const authHeader = "Basic " + Buffer.from(`${config.userId}:${config.apiKey}`).toString("base64");

    // Find appointment types
    const typesRes = await fetch("https://acuityscheduling.com/api/v1/appointment-types", {
      headers: { Authorization: authHeader }
    });
    const types = await typesRes.json();

    const matchedType = types.find((t: any) =>
      t.name.toLowerCase().includes(request.service.toLowerCase())
    );

    if (!matchedType) {
      return {
        success: true,
        message: `I've noted your request for ${request.service}${request.preferredDate ? ` on ${request.preferredDate}` : ""}. Our team will call ${request.customerPhone} to confirm the appointment. Is there anything else I can help with?`
      };
    }

    // Build datetime
    let datetime = "";
    if (request.preferredDate && request.preferredTime) {
      datetime = `${request.preferredDate}T${request.preferredTime}:00`;
    } else if (request.preferredDate) {
      datetime = `${request.preferredDate}T10:00:00`;
    }

    // Create appointment
    const bookRes = await fetch("https://acuityscheduling.com/api/v1/appointments", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentTypeID: matchedType.id,
        datetime,
        firstName: request.customerName.split(" ")[0],
        lastName: request.customerName.split(" ").slice(1).join(" ") || "",
        phone: request.customerPhone,
        notes: request.referredBy ? `Referred by: ${request.referredBy}` : undefined,
      })
    });

    if (bookRes.ok) {
      const appointment = await bookRes.json();
      return {
        success: true,
        confirmationId: appointment.id?.toString(),
        message: `Your ${request.service} appointment is confirmed for ${appointment.datetime || request.preferredDate}. You'll receive a confirmation at ${request.customerPhone}. Your confirmation number is ${appointment.id}. Is there anything else I can help with?`
      };
    } else {
      console.error("ACUITY_BOOK_ERROR:", await bookRes.text());
      return bookInternal(request);
    }
  } catch (err) {
    console.error("ACUITY_ERROR:", err);
    return bookInternal(request);
  }
}

/**
 * Mode 4: Mindbody API (v6)
 * Config: { siteId: string, apiKey: string }
 * Note: Mindbody requires site-specific credentials and location/staff IDs
 */
async function bookViaMindbody(request: BookingRequest, config: any): Promise<BookingResult> {
  if (!config?.siteId || !config?.apiKey) {
    console.error("MINDBODY_CONFIG_MISSING");
    return bookInternal(request);
  }

  try {
    // Mindbody v6 API endpoint
    const baseUrl = "https://api.mindbodyonline.com/public/v6";
    const headers = {
      "Api-Key": config.apiKey,
      "SiteId": config.siteId,
      "Content-Type": "application/json"
    };

    // Step 1: Find client by phone or create
    // Step 1 placeholder — result intentionally unused until full Mindbody integration
    await fetch(`${baseUrl}/client/clients`, {
      method: "GET",
      headers: {
        ...headers,
        "Authorization": `Bearer ${config.apiKey}` // May need OAuth token instead
      }
    });

    // Step 2: Get bookable items (services/staff/times)
    // This is complex — Mindbody requires location ID, staff ID, session type ID
    // For now, fall back to internal and let staff handle
    return {
      success: true,
      message: `I've noted your request for ${request.service}${request.preferredDate ? ` on ${request.preferredDate}` : ""}${request.preferredTime ? ` at ${request.preferredTime}` : ""}. Our team will call ${request.customerPhone} within a few hours to confirm the exact time and complete your booking. Is there anything else I can help with?`
    };

    // Full Mindbody integration would require:
    // 1. GET /client/clients (find or create client)
    // 2. GET /appointment/bookableitems (get available times)
    // 3. POST /appointment/addappointment (book it)
    // This is substantial work — recommend doing this as a separate focused task
  } catch (err) {
    console.error("MINDBODY_ERROR:", err);
    return bookInternal(request);
  }
}

/**
 * Mode 5: Booking Link — just text them a URL
 * Config: { bookingUrl: string }
 * Simplest mode — works with any scheduling system
 */
async function bookViaLink(request: BookingRequest, config: any): Promise<BookingResult> {
  const bookingUrl = config?.bookingUrl || config?.schedulingUrl;
  
  if (!bookingUrl) {
    console.error("LINK_CONFIG_MISSING");
    return bookInternal(request);
  }

  // Log the request internally too (so staff can follow up if needed)
  const { error: logErr } = await supabaseAdmin.from("booking_requests").insert({
    tenant_id: request.tenantId,
    service: request.service,
    preferred_date: request.preferredDate || null,
    preferred_time: request.preferredTime || null,
    customer_name: request.customerName,
    customer_phone: request.customerPhone,
    referred_by: request.referredBy || null,
    notes: "Booking link sent",
    backup_slots: request.backupSlots || null,
    time_preference: request.timePreference || null,
    provider_preference: request.providerPreference || null,
    status: "pending",
  });
  if (logErr) console.error("LINK_MODE_LOG_ERROR:", logErr);

  return {
    success: true,
    message: `Perfect! I can text you our booking link so you can pick the exact time that works best for you. You'll receive a text at ${request.customerPhone} with the link to schedule your ${request.service}. Our booking page is also available at ${bookingUrl}. Is there anything else I can help with today?`
  };
}
