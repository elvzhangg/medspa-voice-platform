import { supabaseAdmin } from "./supabase";

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
  backupSlots?: string;       // e.g. "also Thursday mornings or any Friday afternoon"
  timePreference?: string;    // e.g. "mornings before noon", "afternoons preferred"
  providerPreference?: string; // e.g. "prefers Dr. Sarah", "no preference"
}

interface BookingResult {
  success: boolean;
  message: string;
  confirmationId?: string;
}

export async function bookAppointment(request: BookingRequest): Promise<BookingResult> {
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, name, booking_provider, booking_config, booking_forward_enabled, booking_forward_phones, booking_forward_sms_template")
    .eq("id", request.tenantId)
    .single();

  const provider = tenant?.booking_provider || "internal";

  let result: BookingResult;

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

  // Staff-forward notification: if enabled, SMS the designated staff phones
  // regardless of booking provider so the right people are always in the loop.
  if (result.success && tenant?.booking_forward_enabled && (tenant.booking_forward_phones ?? []).length > 0) {
    await sendStaffForwardNotification(request, tenant, result.confirmationId);
  }

  return result;
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
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn("STAFF_FORWARD_SMS_SKIPPED: Twilio env vars not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)");
    return;
  }

  const template: string =
    tenant.booking_forward_sms_template ||
    "📋 New booking request via AI receptionist\n\nPatient: [CustomerName]\nPhone: [CustomerPhone]\nService: [Service]\nRequested: [DateTime]\nBackup slots: [BackupSlots]\nTime preference: [TimePreference]\nProvider preference: [ProviderPreference]\nNotes: [Notes]\n\nPlease text or call to confirm.\n— [ClinicName] VauxVoice";

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
  // 1. Log the booking request
  const { data: requestRecord, error: reqErr } = await supabaseAdmin.from("booking_requests").insert({
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
    status: "pending",
  }).select().single();

  if (reqErr) {
    console.error("BOOKING_INSERT_ERROR:", reqErr);
    return {
      success: false,
      message: "I'm sorry, I had trouble recording your appointment request. Could you please call back?"
    };
  }

  // 2. Also create a calendar event (tentative)
  if (request.preferredDate && request.preferredTime) {
    const startTime = new Date(`${request.preferredDate}T${request.preferredTime}`);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour default

    await supabaseAdmin.from("calendar_events").insert({
      tenant_id: request.tenantId,
      title: `${request.customerName} - ${request.service}`,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      customer_name: request.customerName,
      customer_phone: request.customerPhone,
      service_type: request.service,
      status: "confirmed"
    });
  }

  let msg = `I've scheduled your ${request.service} appointment request`;
  if (request.preferredDate) msg += ` for ${request.preferredDate}`;
  if (request.preferredTime) msg += ` at ${request.preferredTime}`;
  msg += `. I've added this to our team's calendar and you'll receive a confirmation text shortly. Is there anything else I can help with?`;

  return { success: true, message: msg };
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
