import { createHmac, timingSafeEqual } from "crypto";
import type {
  AdapterContext,
  AdapterSlot,
  AdapterBookingInput,
  AdapterBookingResult,
  AdapterTestResult,
  AdapterWebhookEvent,
  AdapterWebhookEventType,
  BookingAdapter,
} from "./types";

/**
 * Zenoti adapter.
 * API docs: https://docs.zenoti.com/reference
 *
 * Auth: `apikey <api_key>` in the Authorization header.
 *
 * Creds (set by admin):
 *   credentials.api_key       Zenoti Enterprise API key
 *   config.center_id          UUID of the physical center (Zenoti = "center")
 *
 * Zenoti booking is a two-step dance:
 *   1. POST /v1/bookings  with center_id + service_id (+ therapist_id) — returns booking_id
 *   2. GET  /v1/bookings/{id}/slots?check_future_day_availability=true
 *      (or POST /v1/bookings/{id}/slots/reserve for the chosen slot)
 *   3. POST /v1/bookings/{id}/slots/confirm  to finalize.
 *
 * We collapse (1) + (2) into getAvailableSlots, and (reserve) + (confirm)
 * into bookAppointment. We stash the draft booking_id in the slot's
 * serviceId field so bookAppointment can recover it without round-tripping.
 */

const BASE_URL = "https://api.zenoti.com/v1";

async function zFetch<T = unknown>(
  ctx: AdapterContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const apiKey = ctx.credentials.api_key;
  if (!apiKey) throw new Error("Missing Zenoti api_key");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `apikey ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zenoti ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

interface ZenotiService {
  id: string;
  name: string;
  duration?: number;
  code?: string;
}

interface ZenotiTherapist {
  id: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
}

interface ZenotiSlot {
  Time: string; // ISO-ish
  Available?: boolean;
  Warnings?: string[];
}

const adapter: BookingAdapter = {
  platform: "zenoti",

  async testConnection(ctx): Promise<AdapterTestResult> {
    try {
      const centerId = ctx.config.center_id;
      if (!centerId) return { ok: false, detail: "Missing config.center_id" };
      const res = await zFetch<{ name?: string; display_name?: string }>(ctx, `/centers/${centerId}`);
      return { ok: true, businessName: res?.display_name || res?.name };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async getAvailableSlots(ctx, { date, service, provider }): Promise<AdapterSlot[]> {
    const centerId = ctx.config.center_id;
    if (!centerId) throw new Error("Missing Zenoti center_id");

    // 1. Resolve service
    const svcRes = await zFetch<{ services?: ZenotiService[] }>(
      ctx,
      `/centers/${centerId}/services?size=200`
    );
    const services = svcRes?.services ?? [];
    const wanted = (service || "").toLowerCase().trim();
    const svc = wanted ? services.find((s) => (s.name || "").toLowerCase().includes(wanted)) : services[0];
    if (!svc) return [];

    // 2. Optionally resolve therapist
    let therapistId: string | undefined;
    if (provider && !/no preference|any|anyone/i.test(provider)) {
      const needle = provider.toLowerCase().replace(/dr\.?\s*/g, "").trim();
      const staff = await zFetch<{ therapists?: ZenotiTherapist[] }>(
        ctx,
        `/centers/${centerId}/therapists?size=200`
      );
      const matched = (staff?.therapists ?? []).find((t) => {
        const n = (t.display_name || `${t.first_name ?? ""} ${t.last_name ?? ""}`).toLowerCase();
        return n.includes(needle) || needle.split(/\s+/).some((p) => p.length > 2 && n.includes(p));
      });
      if (!matched) return [];
      therapistId = matched.id;
    }

    // 3. Create draft booking
    const draft = await zFetch<{ id?: string }>(ctx, "/bookings", {
      method: "POST",
      body: JSON.stringify({
        center_id: centerId,
        date,
        is_only_catalog_employees: false,
        guests: [
          {
            items: [
              {
                item: { id: svc.id },
                therapist: therapistId ? { id: therapistId } : undefined,
              },
            ],
          },
        ],
      }),
    });
    const bookingId = draft?.id;
    if (!bookingId) return [];

    // 4. Fetch slots on the draft
    const slotsRes = await zFetch<{ slots?: ZenotiSlot[] }>(
      ctx,
      `/bookings/${bookingId}/slots?check_future_day_availability=false`
    );
    const slots = (slotsRes?.slots ?? []).filter((s) => s.Available !== false);

    return slots.map((s) => ({
      label: new Date(s.Time).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      startTime: s.Time,
      // Stash draft booking ID — bookAppointment reads it from serviceId
      serviceId: bookingId,
      staffId: therapistId,
    }));
  },

  async parseWebhookEvent(ctx, { headers, rawBody }): Promise<AdapterWebhookEvent | null> {
    // Zenoti's webhook docs vary by enterprise plan — field names drift
    // between tenants, so we normalize loosely and verify against real
    // traffic when the first tenant onboards.
    //
    // Signature (Zenoti Enterprise default): hex(HMAC-SHA256(rawBody, secret)),
    // header X-Zenoti-Signature. Secret is the value Zenoti asks the admin
    // to paste when configuring the subscription; stored on credentials.webhook_secret.
    const secret = ctx.credentials.webhook_secret;
    const sigHeader = headers["x-zenoti-signature"];
    let signatureOk = false;
    if (secret && sigHeader) {
      try {
        const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
        const clean = sigHeader.replace(/^sha256=/, "");
        const a = Buffer.from(expected, "hex");
        const b = Buffer.from(clean, "hex");
        signatureOk = a.length === b.length && timingSafeEqual(a, b);
      } catch {
        signatureOk = false;
      }
    }

    let payload: {
      event_type?: string;
      event?: string;
      type?: string;
      data?: Record<string, unknown>;
      appointment?: Record<string, unknown>;
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const body = (payload.appointment || payload.data || payload) as Record<string, unknown>;
    const raw = (payload.event_type || payload.event || payload.type || "").toString().toLowerCase();

    // Zenoti sends ids under a few different keys across plans
    const externalId =
      (body.appointment_id as string | undefined) ||
      (body.id as string | undefined) ||
      (body.booking_id as string | undefined);
    if (!externalId) return null;

    let eventType: AdapterWebhookEventType | null = null;
    if (raw.includes("cancel")) eventType = "appointment.cancelled";
    else if (raw.includes("reschedul")) eventType = "appointment.rescheduled";
    else if (raw.includes("creat") || raw.includes("add") || raw.includes("book"))
      eventType = "appointment.created";
    else if (raw.includes("updat") || raw.includes("chang")) eventType = "appointment.updated";
    if (!eventType) return null;

    const guest = (body.guest || body.customer || {}) as {
      first_name?: string;
      last_name?: string;
      mobile_phone?: string | { number?: string };
      phone?: string;
    };
    const service = (body.service || {}) as { name?: string };
    const therapist = (body.therapist || body.staff || {}) as {
      display_name?: string;
      first_name?: string;
      last_name?: string;
    };

    const customerName =
      [guest.first_name, guest.last_name].filter(Boolean).join(" ") || undefined;
    const customerPhone =
      typeof guest.mobile_phone === "string"
        ? guest.mobile_phone
        : guest.mobile_phone?.number || guest.phone;
    const staffName =
      therapist.display_name ||
      [therapist.first_name, therapist.last_name].filter(Boolean).join(" ") ||
      undefined;

    return {
      signatureOk,
      eventType,
      externalId: String(externalId),
      startTime: (body.start_time || body.appointment_time || body.start_date_time) as string | undefined,
      endTime: (body.end_time || body.end_date_time) as string | undefined,
      serviceName: service.name,
      staffName,
      customerName,
      customerPhone,
      cancelled: eventType === "appointment.cancelled",
    };
  },

  async bookAppointment(ctx, input: AdapterBookingInput): Promise<AdapterBookingResult> {
    if (!input.serviceId) {
      return { ok: false, error: "Missing serviceId (draft booking_id)", errorCode: "validation" };
    }
    const bookingId = input.serviceId;

    try {
      // 1. Reserve the chosen slot
      await zFetch(ctx, `/bookings/${bookingId}/slots/reserve`, {
        method: "POST",
        body: JSON.stringify({ slot_time: input.startTime }),
      });

      // 2. Attach guest info (Zenoti requires a guest_id on the booking before
      //    confirm). Upsert by phone.
      const [firstName, ...rest] = input.customerName.trim().split(/\s+/);
      const lastName = rest.join(" ") || "-";

      const centerId = ctx.config.center_id!;
      const guestSearch = await zFetch<{ guests?: { id?: string }[] }>(
        ctx,
        `/guests/search?center_id=${centerId}&mobile=${encodeURIComponent(input.customerPhone)}`
      );
      let guestId = guestSearch?.guests?.[0]?.id;
      if (!guestId) {
        const created = await zFetch<{ id?: string }>(ctx, "/guests", {
          method: "POST",
          body: JSON.stringify({
            center_id: centerId,
            personal_info: {
              first_name: firstName,
              last_name: lastName,
              mobile_phone: { number: input.customerPhone, display_number: input.customerPhone },
              email: input.customerEmail,
            },
          }),
        });
        guestId = created?.id;
      }
      if (!guestId) return { ok: false, error: "Could not resolve Zenoti guest", errorCode: "validation" };

      // Attach guest to draft booking
      await zFetch(ctx, `/bookings/${bookingId}`, {
        method: "PUT",
        body: JSON.stringify({
          guests: [{ id: guestId, items: [{}] }],
          notes: input.notes,
        }),
      }).catch(() => {
        // Some Zenoti tenants wire guest on the initial draft creation; this
        // PUT is a best-effort update.
      });

      // 3. Confirm
      const confirmed = await zFetch<{ is_confirmed?: boolean; booking_id?: string }>(
        ctx,
        `/bookings/${bookingId}/slots/confirm`,
        {
          method: "POST",
          body: JSON.stringify({ notes: input.notes }),
        }
      );
      if (confirmed?.is_confirmed === false) {
        return { ok: false, error: "Zenoti refused to confirm", errorCode: "unavailable" };
      }
      return { ok: true, appointmentId: confirmed?.booking_id || bookingId };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const unavailable = /not available|unavailable|conflict|slot/i.test(detail);
      console.error("ZENOTI_BOOK_ERR:", detail);
      return {
        ok: false,
        error: detail,
        errorCode: unavailable ? "unavailable" : "network",
      };
    }
  },
};

export default adapter;
