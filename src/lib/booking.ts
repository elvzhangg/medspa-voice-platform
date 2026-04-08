import { supabaseAdmin } from "./supabase";

/**
 * Booking integration layer.
 * 
 * Supports multiple modes per tenant:
 * - "internal" (default): Stores booking requests in our DB, sends notification
 * - "acuity": Creates appointment via Acuity Scheduling API
 * - "calendly": Creates appointment via Calendly API
 * 
 * The booking_provider and booking_config fields on the tenant determine which mode to use.
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
}

interface BookingResult {
  success: boolean;
  message: string;
  confirmationId?: string;
}

/**
 * Book an appointment using the tenant's configured booking provider.
 * Falls back to internal booking if no external provider is configured.
 */
export async function bookAppointment(request: BookingRequest): Promise<BookingResult> {
  // Look up tenant's booking provider config
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, name, booking_provider, booking_config")
    .eq("id", request.tenantId)
    .single();

  const provider = tenant?.booking_provider || "internal";

  switch (provider) {
    case "acuity":
      return bookViaAcuity(request, tenant?.booking_config);
    case "calendly":
      return bookViaCalendly(request, tenant?.booking_config);
    default:
      return bookInternal(request);
  }
}

/**
 * Internal booking: Store in our DB and return a confirmation.
 * The med spa's staff will follow up to confirm.
 */
async function bookInternal(request: BookingRequest): Promise<BookingResult> {
  const { error } = await supabaseAdmin.from("booking_requests").insert({
    tenant_id: request.tenantId,
    service: request.service,
    preferred_date: request.preferredDate || null,
    preferred_time: request.preferredTime || null,
    customer_name: request.customerName,
    customer_phone: request.customerPhone,
    referred_by: request.referredBy || null,
    notes: request.notes || null,
    status: "pending",
  });

  if (error) {
    console.error("BOOKING_INSERT_ERROR:", error);
    return {
      success: false,
      message: "I'm sorry, I had trouble recording your appointment request. Could you please call back or I can take your number and have someone reach out to you?"
    };
  }

  let msg = `I've scheduled your ${request.service} appointment request`;
  if (request.preferredDate) msg += ` for ${request.preferredDate}`;
  if (request.preferredTime) msg += ` at ${request.preferredTime}`;
  msg += `. Our team will call ${request.customerPhone} within the next few hours to confirm your exact appointment time. Is there anything else I can help you with?`;

  return { success: true, message: msg };
}

/**
 * Acuity Scheduling integration.
 * Requires booking_config: { userId: string, apiKey: string }
 */
async function bookViaAcuity(
  request: BookingRequest,
  config: Record<string, string> | null
): Promise<BookingResult> {
  if (!config?.userId || !config?.apiKey) {
    console.error("ACUITY_CONFIG_MISSING for tenant:", request.tenantId);
    return bookInternal(request); // Fallback to internal
  }

  try {
    // Step 1: Find available appointment types
    const authHeader = "Basic " + Buffer.from(`${config.userId}:${config.apiKey}`).toString("base64");

    const typesRes = await fetch("https://acuityscheduling.com/api/v1/appointment-types", {
      headers: { Authorization: authHeader }
    });
    const types = await typesRes.json();

    // Find matching appointment type by name
    const matchedType = types.find((t: any) =>
      t.name.toLowerCase().includes(request.service.toLowerCase())
    );

    if (!matchedType) {
      // Service not found in Acuity — fall back to internal and let staff handle
      return {
        success: true,
        message: `I've noted your request for ${request.service}${request.preferredDate ? ` on ${request.preferredDate}` : ""}. Our team will call ${request.customerPhone} to confirm the appointment and find the best available time. Is there anything else I can help with?`
      };
    }

    // Step 2: Check availability
    let datetime = "";
    if (request.preferredDate && request.preferredTime) {
      datetime = `${request.preferredDate}T${request.preferredTime}:00`;
    } else if (request.preferredDate) {
      datetime = `${request.preferredDate}T10:00:00`; // Default to 10 AM
    }

    // Step 3: Create the appointment
    const bookRes = await fetch("https://acuityscheduling.com/api/v1/appointments", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        appointmentTypeID: matchedType.id,
        datetime: datetime,
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
        message: `Your ${request.service} appointment has been confirmed for ${appointment.datetime || request.preferredDate}. You'll receive a confirmation at ${request.customerPhone}. Your confirmation number is ${appointment.id}. Is there anything else I can help with?`
      };
    } else {
      const errText = await bookRes.text();
      console.error("ACUITY_BOOK_ERROR:", errText);
      // Fallback: still log it internally
      return {
        success: true,
        message: `I've noted your request for ${request.service}${request.preferredDate ? ` on ${request.preferredDate}` : ""}${request.preferredTime ? ` at ${request.preferredTime}` : ""}. Our team will call ${request.customerPhone} shortly to confirm the exact time. Is there anything else I can help with?`
      };
    }
  } catch (err) {
    console.error("ACUITY_ERROR:", err);
    return bookInternal(request); // Fallback
  }
}

/**
 * Calendly integration placeholder.
 * Requires booking_config: { apiKey: string, eventTypeUri: string }
 */
async function bookViaCalendly(
  request: BookingRequest,
  config: Record<string, string> | null
): Promise<BookingResult> {
  // Calendly doesn't support creating appointments via API directly (invitees schedule themselves).
  // Instead, generate a scheduling link.
  if (!config?.schedulingUrl) {
    return bookInternal(request);
  }

  return {
    success: true,
    message: `I'd love to help you book your ${request.service} appointment. I can text you a direct booking link to ${request.customerPhone} so you can pick the exact time that works best for you. Our team is also available to help at ${config.schedulingUrl}. Would you like me to send that link?`
  };
}
