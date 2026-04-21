import type {
  AdapterContext,
  AdapterSlot,
  AdapterBookingInput,
  AdapterBookingResult,
  AdapterTestResult,
  BookingAdapter,
} from "./types";

/**
 * Square Appointments adapter.
 * API docs: https://developer.squareup.com/reference/square/bookings-api
 *
 * Auth: Bearer access token (either personal access token from the
 * Square dashboard, or the OAuth access_token we'll collect once the
 * Square OAuth flow is live).
 *
 * Creds (set by admin):
 *   credentials.access_token
 *   config.location_id          Square Location ID the clinic operates from
 *
 * Square is a single-call search: POST /v2/bookings/availability/search
 * with a location + service-variation filter, then POST /v2/bookings
 * to book. Customer rows live under /v2/customers — we upsert by phone.
 */

const BASE_URL = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-10-17";

async function sqFetch<T = unknown>(
  ctx: AdapterContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = ctx.credentials.access_token;
  if (!token) throw new Error("Missing Square access_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Square ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

interface SqCatalogObject {
  id: string;
  type: string;
  item_variation_data?: { name?: string; item_id?: string };
  item_data?: { name?: string };
}

interface SqTeamMember {
  id: string;
  given_name?: string;
  family_name?: string;
  display_name?: string;
}

interface SqAvailability {
  start_at: string;
  location_id?: string;
  appointment_segments?: Array<{
    team_member_id?: string;
    service_variation_id?: string;
    duration_minutes?: number;
  }>;
}

interface SqCustomer {
  id: string;
  phone_number?: string;
}

const adapter: BookingAdapter = {
  platform: "square",

  async testConnection(ctx): Promise<AdapterTestResult> {
    try {
      const locationId = ctx.config.location_id;
      if (!locationId) {
        return { ok: false, detail: "Missing config.location_id" };
      }
      const res = await sqFetch<{ location?: { name?: string; business_name?: string } }>(
        ctx,
        `/locations/${locationId}`
      );
      return {
        ok: true,
        businessName: res?.location?.business_name || res?.location?.name,
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async getAvailableSlots(ctx, { date, service, provider }): Promise<AdapterSlot[]> {
    const locationId = ctx.config.location_id;
    if (!locationId) throw new Error("Missing Square location_id");

    // 1. Find service variation — Square books against ITEM_VARIATION, not ITEM.
    const catalog = await sqFetch<{ objects?: SqCatalogObject[] }>(
      ctx,
      "/catalog/list?types=ITEM_VARIATION"
    );
    const variations = catalog?.objects ?? [];
    const wanted = (service || "").toLowerCase().trim();
    const variation = wanted
      ? variations.find((v) => (v.item_variation_data?.name || "").toLowerCase().includes(wanted))
      : variations[0];
    if (!variation) return [];

    // 2. Optionally resolve provider → team member
    let teamMemberId: string | undefined;
    if (provider && !/no preference|any|anyone/i.test(provider)) {
      const needle = provider.toLowerCase().replace(/dr\.?\s*/g, "").trim();
      const team = await sqFetch<{ team_members?: SqTeamMember[] }>(ctx, "/team-members/search", {
        method: "POST",
        body: JSON.stringify({ query: { filter: { location_ids: [locationId] } } }),
      });
      const matched = (team?.team_members ?? []).find((m) => {
        const n = (
          m.display_name ||
          `${m.given_name ?? ""} ${m.family_name ?? ""}`
        )
          .toLowerCase()
          .trim();
        return n.includes(needle) || needle.split(/\s+/).some((p) => p.length > 2 && n.includes(p));
      });
      if (!matched) return [];
      teamMemberId = matched.id;
    }

    // 3. Availability search — Square wants a UTC window; we bracket the
    //    local date loosely (start-of-day UTC to start-of-next-day UTC).
    const startUtc = new Date(`${date}T00:00:00Z`).toISOString();
    const endUtc = new Date(new Date(`${date}T00:00:00Z`).getTime() + 36 * 3600_000).toISOString();

    const segmentFilter: Record<string, unknown> = {
      service_variation_id: variation.id,
    };
    if (teamMemberId) {
      segmentFilter.team_member_id_filter = { any: [teamMemberId] };
    }

    const res = await sqFetch<{ availabilities?: SqAvailability[] }>(
      ctx,
      "/bookings/availability/search",
      {
        method: "POST",
        body: JSON.stringify({
          query: {
            filter: {
              start_at_range: { start_at: startUtc, end_at: endUtc },
              location_id: locationId,
              segment_filters: [segmentFilter],
            },
          },
        }),
      }
    );
    const avails = res?.availabilities ?? [];
    return avails.map((a) => ({
      label: new Date(a.start_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      startTime: a.start_at,
      serviceId: variation.id,
      staffId: a.appointment_segments?.[0]?.team_member_id,
    }));
  },

  async bookAppointment(ctx, input: AdapterBookingInput): Promise<AdapterBookingResult> {
    const locationId = ctx.config.location_id;
    if (!locationId) return { ok: false, error: "Missing location_id", errorCode: "validation" };
    if (!input.serviceId) return { ok: false, error: "Missing serviceId", errorCode: "validation" };
    if (!input.staffId) return { ok: false, error: "Missing staffId", errorCode: "validation" };

    try {
      // 1. Upsert customer by phone
      const [givenName, ...rest] = input.customerName.trim().split(/\s+/);
      const familyName = rest.join(" ") || undefined;

      const search = await sqFetch<{ customers?: SqCustomer[] }>(ctx, "/customers/search", {
        method: "POST",
        body: JSON.stringify({
          query: { filter: { phone_number: { exact: input.customerPhone } } },
        }),
      });
      let customerId = search?.customers?.[0]?.id;
      if (!customerId) {
        const created = await sqFetch<{ customer?: { id?: string } }>(ctx, "/customers", {
          method: "POST",
          body: JSON.stringify({
            given_name: givenName,
            family_name: familyName,
            phone_number: input.customerPhone,
            email_address: input.customerEmail,
          }),
        });
        customerId = created?.customer?.id;
      }
      if (!customerId) {
        return { ok: false, error: "Could not resolve Square customer", errorCode: "validation" };
      }

      // 2. Create booking
      const idempotencyKey = `vv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const res = await sqFetch<{ booking?: { id?: string } }>(ctx, "/bookings", {
        method: "POST",
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          booking: {
            start_at: input.startTime,
            location_id: locationId,
            customer_id: customerId,
            customer_note: input.notes,
            appointment_segments: [
              {
                team_member_id: input.staffId,
                service_variation_id: input.serviceId,
                service_variation_version: 1,
              },
            ],
          },
        }),
      });
      const bookingId = res?.booking?.id;
      if (!bookingId) return { ok: false, error: "No booking ID returned", errorCode: "unknown" };
      return { ok: true, appointmentId: bookingId };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const unavailable = /not available|unavailable|conflict|overlap|NOT_FOUND/i.test(detail);
      console.error("SQUARE_BOOK_ERR:", detail);
      return {
        ok: false,
        error: detail,
        errorCode: unavailable ? "unavailable" : "network",
      };
    }
  },
};

export default adapter;
