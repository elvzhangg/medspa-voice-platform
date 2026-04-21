import type {
  AdapterContext,
  AdapterSlot,
  AdapterBookingInput,
  AdapterBookingResult,
  AdapterTestResult,
  BookingAdapter,
} from "./types";

/**
 * Jane App adapter — HYBRID mode.
 *
 * Jane's Partner API (request-only; they approve case-by-case for
 * integrators) gives us availability reads but restricts booking writes
 * to a narrow set of approved scopes. To avoid the risk of a half-working
 * book that creates orphan appointments in Jane, we run Jane as hybrid:
 * AI reads availability live, booking goes through the SMS-to-staff flow.
 *
 * Set tenant integration_mode = "hybrid".
 *
 * Creds (set by admin, once Jane approves the partner app):
 *   credentials.api_key    Jane Partner API token
 *   config.clinic_id       Jane clinic UUID the AI operates on
 *
 * API root (Jane uses subdomain-per-clinic for the public site but a
 * centralized partner endpoint for API):
 *   https://api.jane.app/v1
 */

const BASE_URL = "https://api.jane.app/v1";

async function janeFetch<T = unknown>(
  ctx: AdapterContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const apiKey = ctx.credentials.api_key;
  if (!apiKey) throw new Error("Missing Jane api_key");
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
  if (!res.ok) throw new Error(`Jane ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

interface JaneTreatment {
  id: string;
  name: string;
  duration_in_minutes?: number;
}

interface JanePractitioner {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
}

interface JaneOpening {
  start_at: string;
  end_at?: string;
  practitioner_id?: string;
  treatment_id?: string;
}

const adapter: BookingAdapter = {
  platform: "jane",

  async testConnection(ctx): Promise<AdapterTestResult> {
    try {
      const clinicId = ctx.config.clinic_id;
      if (!clinicId) return { ok: false, detail: "Missing config.clinic_id" };
      const res = await janeFetch<{ name?: string; clinic_name?: string }>(
        ctx,
        `/clinics/${clinicId}`
      );
      return { ok: true, businessName: res?.clinic_name || res?.name };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async getAvailableSlots(ctx, { date, service, provider }): Promise<AdapterSlot[]> {
    const clinicId = ctx.config.clinic_id;
    if (!clinicId) return [];

    // 1. Treatments (Jane's word for "services")
    const tRes = await janeFetch<{ treatments?: JaneTreatment[] }>(
      ctx,
      `/clinics/${clinicId}/treatments`
    );
    const treatments = tRes?.treatments ?? [];
    const wanted = (service || "").toLowerCase().trim();
    const treatment = wanted
      ? treatments.find((t) => (t.name || "").toLowerCase().includes(wanted))
      : treatments[0];
    if (!treatment) return [];

    // 2. Practitioner
    let practitionerId: string | undefined;
    if (provider && !/no preference|any|anyone/i.test(provider)) {
      const needle = provider.toLowerCase().replace(/dr\.?\s*/g, "").trim();
      const pRes = await janeFetch<{ practitioners?: JanePractitioner[] }>(
        ctx,
        `/clinics/${clinicId}/practitioners`
      );
      const matched = (pRes?.practitioners ?? []).find((p) => {
        const n = (p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`)
          .toLowerCase()
          .trim();
        return n.includes(needle) || needle.split(/\s+/).some((x) => x.length > 2 && n.includes(x));
      });
      if (!matched) return [];
      practitionerId = matched.id;
    }

    // 3. Openings
    const params = new URLSearchParams({ date, treatment_id: treatment.id });
    if (practitionerId) params.set("practitioner_id", practitionerId);
    const oRes = await janeFetch<{ openings?: JaneOpening[] }>(
      ctx,
      `/clinics/${clinicId}/openings?${params}`
    );
    const openings = oRes?.openings ?? [];

    return openings.map((o) => ({
      label: new Date(o.start_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      startTime: o.start_at,
      serviceId: treatment.id,
      staffId: o.practitioner_id || practitionerId,
    }));
  },

  async bookAppointment(_ctx, _input: AdapterBookingInput): Promise<AdapterBookingResult> {
    // Jane Partner API write scopes are gated; booking flows through the
    // staff SMS confirmation path to avoid half-created records.
    return {
      ok: false,
      error: "Jane API write access is restricted — routing to staff SMS confirmation.",
      errorCode: "validation",
    };
  },
};

export default adapter;
