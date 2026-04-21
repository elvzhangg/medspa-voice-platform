import { createHmac } from "crypto";
import type {
  AdapterContext,
  AdapterSlot,
  AdapterBookingInput,
  AdapterBookingResult,
  AdapterTestResult,
  BookingAdapter,
} from "./types";

/**
 * WellnessLiving adapter — direct_book.
 * API docs: https://developers.wellnessliving.com/
 *
 * Auth: WellnessLiving uses a signed-request scheme with an app ID +
 * app secret pair. For our server-side use we collect both and sign
 * each request HMAC-SHA256. In practice many installations also
 * provision a `api_key` bearer shortcut — we support both:
 *   credentials.api_key               (bearer, preferred when available)
 *   credentials.app_id + app_secret   (signed fallback)
 *   config.business_id                WellnessLiving business/location ID
 *
 * WellnessLiving requires an account executive to enable Developer API
 * access on the tenant's plan — add a note to that effect in onboarding.
 */

const BASE_URL = "https://api.wellnessliving.com";

async function wlFetch<T = unknown>(
  ctx: AdapterContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const apiKey = ctx.credentials.api_key;
  const appId = ctx.credentials.app_id;
  const appSecret = ctx.credentials.app_secret;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (appId && appSecret) {
    // Signed request — WL signs the path + body with HMAC-SHA256.
    const bodyStr = typeof init.body === "string" ? init.body : "";
    const sig = createHmac("sha256", appSecret).update(`${path}${bodyStr}`).digest("hex");
    headers["X-WL-App-Id"] = appId;
    headers["X-WL-Signature"] = sig;
  } else {
    throw new Error("Missing WellnessLiving credentials (api_key OR app_id+app_secret)");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WellnessLiving ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

interface WlService {
  id: string;
  name: string;
  duration?: number;
}

interface WlStaff {
  id: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
}

interface WlSlot {
  start_datetime: string;
  end_datetime?: string;
  staff_id?: string;
  service_id?: string;
}

const adapter: BookingAdapter = {
  platform: "wellnessliving",

  async testConnection(ctx): Promise<AdapterTestResult> {
    try {
      const businessId = ctx.config.business_id;
      if (!businessId) return { ok: false, detail: "Missing config.business_id" };
      const res = await wlFetch<{ name?: string; business_name?: string }>(
        ctx,
        `/business/${businessId}`
      );
      return { ok: true, businessName: res?.business_name || res?.name };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async getAvailableSlots(ctx, { date, service, provider }): Promise<AdapterSlot[]> {
    const businessId = ctx.config.business_id;
    if (!businessId) return [];

    // 1. Service lookup
    const svcRes = await wlFetch<{ services?: WlService[] }>(
      ctx,
      `/business/${businessId}/services`
    );
    const services = svcRes?.services ?? [];
    const wanted = (service || "").toLowerCase().trim();
    const svc = wanted
      ? services.find((s) => (s.name || "").toLowerCase().includes(wanted))
      : services[0];
    if (!svc) return [];

    // 2. Staff lookup
    let staffId: string | undefined;
    if (provider && !/no preference|any|anyone/i.test(provider)) {
      const needle = provider.toLowerCase().replace(/dr\.?\s*/g, "").trim();
      const staffRes = await wlFetch<{ staff?: WlStaff[] }>(
        ctx,
        `/business/${businessId}/staff`
      );
      const matched = (staffRes?.staff ?? []).find((s) => {
        const n = (s.display_name || `${s.first_name ?? ""} ${s.last_name ?? ""}`)
          .toLowerCase()
          .trim();
        return n.includes(needle) || needle.split(/\s+/).some((p) => p.length > 2 && n.includes(p));
      });
      if (!matched) return [];
      staffId = matched.id;
    }

    // 3. Slots
    const params = new URLSearchParams({ date, service_id: svc.id });
    if (staffId) params.set("staff_id", staffId);
    const slotsRes = await wlFetch<{ slots?: WlSlot[] }>(
      ctx,
      `/business/${businessId}/availability?${params}`
    );
    const slots = slotsRes?.slots ?? [];

    return slots.map((s) => ({
      label: new Date(s.start_datetime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      startTime: s.start_datetime,
      serviceId: svc.id,
      staffId: s.staff_id || staffId,
    }));
  },

  async bookAppointment(ctx, input: AdapterBookingInput): Promise<AdapterBookingResult> {
    const businessId = ctx.config.business_id;
    if (!businessId) return { ok: false, error: "Missing business_id", errorCode: "validation" };
    if (!input.serviceId) return { ok: false, error: "Missing serviceId", errorCode: "validation" };

    const [firstName, ...rest] = input.customerName.trim().split(/\s+/);
    const lastName = rest.join(" ") || "-";

    try {
      // 1. Upsert client by phone
      const search = await wlFetch<{ clients?: Array<{ id?: string }> }>(
        ctx,
        `/business/${businessId}/clients?phone=${encodeURIComponent(input.customerPhone)}`
      );
      let clientId = search?.clients?.[0]?.id;
      if (!clientId) {
        const created = await wlFetch<{ client?: { id?: string } }>(
          ctx,
          `/business/${businessId}/clients`,
          {
            method: "POST",
            body: JSON.stringify({
              first_name: firstName,
              last_name: lastName,
              phone: input.customerPhone,
              email: input.customerEmail,
            }),
          }
        );
        clientId = created?.client?.id;
      }
      if (!clientId) {
        return { ok: false, error: "Could not resolve WL client", errorCode: "validation" };
      }

      // 2. Book
      const res = await wlFetch<{ appointment?: { id?: string } }>(
        ctx,
        `/business/${businessId}/appointments`,
        {
          method: "POST",
          body: JSON.stringify({
            client_id: clientId,
            service_id: input.serviceId,
            staff_id: input.staffId,
            start_datetime: input.startTime,
            notes: input.notes,
          }),
        }
      );
      const apptId = res?.appointment?.id;
      if (!apptId) return { ok: false, error: "No appointment ID returned", errorCode: "unknown" };
      return { ok: true, appointmentId: apptId };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const unavailable = /not available|unavailable|conflict|overlap/i.test(detail);
      console.error("WELLNESSLIVING_BOOK_ERR:", detail);
      return {
        ok: false,
        error: detail,
        errorCode: unavailable ? "unavailable" : "network",
      };
    }
  },
};

export default adapter;
