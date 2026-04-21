import type {
  AdapterContext,
  AdapterSlot,
  AdapterBookingInput,
  AdapterBookingResult,
  AdapterTestResult,
  AdapterProvider,
  BookingAdapter,
} from "./types";

/**
 * Vagaro adapter — HYBRID mode.
 *
 * Vagaro's Merchants API (enterprise-gated) exposes read access for
 * businesses, staff, services, and availability — but no customer-facing
 * writes. So we implement getAvailableSlots for live AI quotes ("Dr. Chen
 * has 2 PM open on Thursday"), but bookAppointment intentionally returns
 * `errorCode: "unavailable"` — the booking flow then falls back to our
 * SMS-to-staff confirmation path.
 *
 * Set tenant integration_mode = "hybrid".
 *
 * Creds (set by admin, once Vagaro approves the business for API access):
 *   credentials.api_key    Bearer token from Vagaro's Merchants Portal
 *   config.business_id     numeric Vagaro business ID the AI operates on
 *
 * API root (sandbox vs prod; Vagaro flips tenants individually):
 *   https://api.vagaro.com/merchants/api/v1
 */

const BASE_URL = "https://api.vagaro.com/merchants/api/v1";

async function vgFetch<T = unknown>(
  ctx: AdapterContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const apiKey = ctx.credentials.api_key;
  if (!apiKey) throw new Error("Missing Vagaro api_key");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vagaro ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

interface VagaroService {
  id: string;
  name: string;
  duration?: number;
}

interface VagaroStaff {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

interface VagaroOpening {
  startDateTime: string;
  endDateTime?: string;
  staffId?: string;
  serviceId?: string;
}

const adapter: BookingAdapter = {
  platform: "vagaro",

  async testConnection(ctx): Promise<AdapterTestResult> {
    try {
      const businessId = ctx.config.business_id;
      if (!businessId) return { ok: false, detail: "Missing config.business_id" };
      const res = await vgFetch<{ name?: string; businessName?: string }>(
        ctx,
        `/businesses/${businessId}`
      );
      return { ok: true, businessName: res?.businessName || res?.name };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async getAvailableSlots(ctx, { date, service, provider }): Promise<AdapterSlot[]> {
    const businessId = ctx.config.business_id;
    if (!businessId) return [];

    // 1. Resolve service by name
    const svcRes = await vgFetch<{ services?: VagaroService[] }>(
      ctx,
      `/businesses/${businessId}/services`
    );
    const services = svcRes?.services ?? [];
    const wanted = (service || "").toLowerCase().trim();
    const svc = wanted
      ? services.find((s) => (s.name || "").toLowerCase().includes(wanted))
      : services[0];
    if (!svc) return [];

    // 2. Optionally resolve staff
    let staffId: string | undefined;
    if (provider && !/no preference|any|anyone/i.test(provider)) {
      const needle = provider.toLowerCase().replace(/dr\.?\s*/g, "").trim();
      const staffRes = await vgFetch<{ staff?: VagaroStaff[] }>(
        ctx,
        `/businesses/${businessId}/staff`
      );
      const matched = (staffRes?.staff ?? []).find((s) => {
        const n = (
          s.displayName || `${s.firstName ?? ""} ${s.lastName ?? ""}`
        )
          .toLowerCase()
          .trim();
        return n.includes(needle) || needle.split(/\s+/).some((p) => p.length > 2 && n.includes(p));
      });
      if (!matched) return [];
      staffId = matched.id;
    }

    // 3. Fetch openings
    const params = new URLSearchParams({ date, serviceId: svc.id });
    if (staffId) params.set("staffId", staffId);
    const openingsRes = await vgFetch<{ openings?: VagaroOpening[] }>(
      ctx,
      `/businesses/${businessId}/availability?${params}`
    );
    const openings = openingsRes?.openings ?? [];

    return openings.map((o) => ({
      label: new Date(o.startDateTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      startTime: o.startDateTime,
      serviceId: svc.id,
      staffId: o.staffId || staffId,
    }));
  },

  async listProviders(ctx): Promise<AdapterProvider[]> {
    const businessId = ctx.config.business_id;
    if (!businessId) return [];

    interface VagaroStaffRow {
      id: string;
      firstName?: string;
      lastName?: string;
      displayName?: string;
      title?: string;
      isActive?: boolean;
    }
    const res = await vgFetch<{ staff?: VagaroStaffRow[] }>(
      ctx,
      `/businesses/${businessId}/staff`
    );
    const rows = res?.staff ?? [];

    return rows
      .map((s) => {
        const name =
          s.displayName?.trim() ||
          `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
        if (!name) return null;
        return {
          externalId: s.id,
          name,
          title: s.title,
          active: s.isActive !== false,
        } as AdapterProvider;
      })
      .filter((p): p is AdapterProvider => p !== null);
  },

  async bookAppointment(_ctx, _input: AdapterBookingInput): Promise<AdapterBookingResult> {
    // Vagaro public API does not expose appointment creation.
    // Booking falls through to the SMS-to-staff flow — we signal that by
    // returning errorCode "validation" so booking.ts takes the fallback.
    return {
      ok: false,
      error: "Vagaro API does not support booking writes — routing to staff SMS confirmation.",
      errorCode: "validation",
    };
  },
};

export default adapter;
