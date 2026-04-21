import { createHmac, timingSafeEqual } from "crypto";
import type {
  AdapterContext,
  AdapterSlot,
  AdapterBookingInput,
  AdapterBookingResult,
  AdapterTestResult,
  AdapterWebhookEvent,
  AdapterWebhookEventType,
  AdapterProvider,
  BookingAdapter,
} from "./types";

/**
 * Acuity Scheduling adapter.
 * API docs: https://developers.acuityscheduling.com/reference
 *
 * Auth: HTTP Basic with user_id as username, api_key as password.
 * Creds (set by admin):
 *   credentials.user_id
 *   credentials.api_key
 *
 * Acuity is self-serve — clinics can sign up and grab these two values
 * from Integrations → API in their Acuity dashboard in under a minute,
 * making it our easiest direct-book platform to onboard today.
 *
 * Acuity models "providers" as "calendars". We attempt fuzzy-match on
 * provider name → calendarID; if no match, we drop the calendar filter
 * rather than silently substituting another staffer.
 */

const BASE_URL = "https://acuityscheduling.com/api/v1";

function authHeader(userId: string, apiKey: string): string {
  const token = Buffer.from(`${userId}:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

async function acuityFetch<T = unknown>(
  ctx: AdapterContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const userId = ctx.credentials.user_id;
  const apiKey = ctx.credentials.api_key;
  if (!userId || !apiKey) throw new Error("Missing Acuity user_id / api_key");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(userId, apiKey),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Acuity ${res.status} ${path}: ${text.slice(0, 300)}`);
  }
  return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

interface AcuityAppointmentType {
  id: number;
  name: string;
  duration: number;
  price: string;
  category?: string;
}

interface AcuityCalendar {
  id: number;
  name: string;
  email?: string;
}

interface AcuityTime {
  time: string; // ISO 8601 local-to-business
  slotsAvailable?: number;
  calendarID?: number;
}

const adapter: BookingAdapter = {
  platform: "acuity",

  async testConnection(ctx): Promise<AdapterTestResult> {
    try {
      const me = await acuityFetch<{ name?: string; email?: string }>(ctx, "/me");
      return { ok: true, businessName: me?.name ?? me?.email };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, detail };
    }
  },

  async getAvailableSlots(ctx, { date, service, provider }): Promise<AdapterSlot[]> {
    // 1. Resolve appointment type by name
    const types = await acuityFetch<AcuityAppointmentType[]>(ctx, "/appointment-types");
    const wanted = (service || "").toLowerCase().trim();
    const matchedType = wanted
      ? types.find((t) => t.name.toLowerCase().includes(wanted))
      : types[0];
    if (!matchedType) return [];

    // 2. Optionally resolve calendar by provider name
    let calendarID: number | undefined;
    if (provider && !/no preference|any|anyone/i.test(provider)) {
      const needle = provider.toLowerCase().replace(/dr\.?\s*/g, "").trim();
      const calendars = await acuityFetch<AcuityCalendar[]>(ctx, "/calendars");
      const matched = calendars.find((c) => {
        const n = c.name.toLowerCase();
        return (
          n.includes(needle) ||
          needle.split(/\s+/).some((p) => p.length > 2 && n.includes(p))
        );
      });
      // If they named a specific provider and we can't find them, return
      // empty so the AI prompts for another day or a different provider.
      if (!matched) return [];
      calendarID = matched.id;
    }

    // 3. Query available times
    const params = new URLSearchParams({
      date,
      appointmentTypeID: String(matchedType.id),
    });
    if (calendarID) params.set("calendarID", String(calendarID));

    const times = await acuityFetch<AcuityTime[]>(ctx, `/availability/times?${params}`);
    if (!Array.isArray(times)) return [];

    return times.map((t) => ({
      label: new Date(t.time).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      startTime: t.time,
      serviceId: String(matchedType.id),
      staffId: t.calendarID ? String(t.calendarID) : calendarID ? String(calendarID) : undefined,
    }));
  },

  async listProviders(ctx): Promise<AdapterProvider[]> {
    // Acuity models providers as "calendars" — one per staff member.
    // /calendars returns id, name, email; working hours aren't exposed
    // via the public API at the calendar level, so we leave workingHours
    // undefined and rely on tenant-entered hours in our staff table.
    const calendars = await acuityFetch<AcuityCalendar[]>(ctx, "/calendars");
    if (!Array.isArray(calendars)) return [];
    return calendars.map((c) => ({
      externalId: String(c.id),
      name: c.name,
      active: true,
    }));
  },

  async parseWebhookEvent(ctx, { headers, rawBody }): Promise<AdapterWebhookEvent | null> {
    // Acuity webhooks are form-encoded and deliver only IDs + action —
    // we have to fetch the full appointment to populate start/end times.
    // Signature: base64(HMAC-SHA256(rawBody, api_key)), header X-Acuity-Signature.
    // https://developers.acuityscheduling.com/docs/webhooks
    const apiKey = ctx.credentials.api_key;
    const sigHeader = headers["x-acuity-signature"];
    let signatureOk = false;
    if (apiKey && sigHeader) {
      try {
        const expected = createHmac("sha256", apiKey).update(rawBody, "utf8").digest("base64");
        const a = Buffer.from(expected, "base64");
        const b = Buffer.from(sigHeader, "base64");
        signatureOk = a.length === b.length && timingSafeEqual(a, b);
      } catch {
        signatureOk = false;
      }
    }

    const form = new URLSearchParams(rawBody);
    const action = (form.get("action") || "").toLowerCase();
    const externalId = form.get("id");
    if (!externalId) return null;

    let eventType: AdapterWebhookEventType | null = null;
    if (action.includes("cancel")) eventType = "appointment.cancelled";
    else if (action.includes("reschedul")) eventType = "appointment.rescheduled";
    else if (action.includes("schedul")) eventType = "appointment.created";
    else if (action.includes("chang")) eventType = "appointment.updated";
    if (!eventType) return null;

    // Cancellations: skip the fetch — the route handler only needs the ID.
    if (eventType === "appointment.cancelled") {
      return { signatureOk, eventType, externalId, cancelled: true };
    }

    // Fetch full appointment detail. If the fetch fails we still return the
    // event with signatureOk so the route can 200 + audit, but without
    // startTime the upsert path is skipped.
    try {
      const appt = await acuityFetch<{
        id: number;
        datetime: string;
        endTime?: string;
        type?: string;
        calendar?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
      }>(ctx, `/appointments/${externalId}`);

      const customerName = [appt.firstName, appt.lastName].filter(Boolean).join(" ") || undefined;
      return {
        signatureOk,
        eventType,
        externalId,
        startTime: appt.datetime,
        endTime: appt.endTime,
        serviceName: appt.type,
        staffName: appt.calendar,
        customerName,
        customerPhone: appt.phone,
      };
    } catch (err) {
      console.warn("ACUITY_WEBHOOK_FETCH_ERR:", err);
      return { signatureOk, eventType, externalId };
    }
  },

  async bookAppointment(ctx, input: AdapterBookingInput): Promise<AdapterBookingResult> {
    if (!input.serviceId) {
      return { ok: false, error: "Missing serviceId (appointmentTypeID)", errorCode: "validation" };
    }

    const [firstName, ...rest] = input.customerName.trim().split(/\s+/);
    const lastName = rest.join(" ") || "-";

    const body: Record<string, unknown> = {
      appointmentTypeID: Number(input.serviceId),
      datetime: input.startTime,
      firstName,
      lastName,
      phone: input.customerPhone,
    };
    if (input.customerEmail) body.email = input.customerEmail;
    if (input.staffId) body.calendarID = Number(input.staffId);
    if (input.notes) body.notes = input.notes;

    try {
      const res = await acuityFetch<{ id: number; datetime: string }>(ctx, "/appointments", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { ok: true, appointmentId: String(res.id) };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Acuity returns 400 with a body when the slot is no longer available
      const unavailable = /not available|slot|unavailable|conflict/i.test(detail);
      console.error("ACUITY_BOOK_ERR:", detail);
      return {
        ok: false,
        error: detail,
        errorCode: unavailable ? "unavailable" : "network",
      };
    }
  },
};

export default adapter;
