import type {
  AdapterContext,
  AdapterSlot,
  AdapterBookingInput,
  AdapterBookingResult,
  AdapterTestResult,
  BookingAdapter,
} from "./types";

/**
 * Boulevard BLVD API adapter.
 *
 * Public developer docs: https://developers.joinblvd.com/reference
 *
 * Boulevard exposes a GraphQL Admin API for business-side operations
 * (what we want). Auth is HTTP Basic with the API key as username and
 * empty password — base64("api_key:").
 *
 * Required fields (populated by admin in /admin/tenants/[id]/integration):
 *   credentials.api_key    - Partner API key issued by Boulevard
 *   credentials.business_id - Business GraphQL ID (e.g. "urn:blvd:Business:xxxx")
 *   config.location_id     - Location GraphQL ID (single location tenants)
 *
 * IMPORTANT: Boulevard partner access requires a 3-week approval. Until
 * we have live credentials, the GraphQL query shapes below are our
 * best-effort based on their public schema. When the first real tenant
 * onboards, verify field names against their current SDL and tighten up.
 */

const DEFAULT_API_URL = "https://dashboard.boulevard.io/api/2020-01/admin";

function authHeader(apiKey: string): string {
  // Basic base64(api_key + ":")
  const token = Buffer.from(`${apiKey}:`).toString("base64");
  return `Basic ${token}`;
}

async function graphql<T = unknown>(
  ctx: AdapterContext,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<{ data?: T; errors?: Array<{ message: string }> }> {
  const apiKey = ctx.credentials.api_key;
  if (!apiKey) throw new Error("Missing Boulevard api_key");

  const url = ctx.config.api_url || DEFAULT_API_URL;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(apiKey),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Boulevard HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

const adapter: BookingAdapter = {
  platform: "boulevard",

  async testConnection(ctx: AdapterContext): Promise<AdapterTestResult> {
    try {
      // Minimal query — fetch the business associated with the API key.
      const q = `query { business { id name } }`;
      const res = await graphql<{ business: { id: string; name: string } }>(ctx, q);
      if (res.errors?.length) {
        return { ok: false, detail: res.errors.map((e) => e.message).join("; ") };
      }
      if (!res.data?.business) {
        return { ok: false, detail: "No business returned for these credentials" };
      }
      return { ok: true, businessName: res.data.business.name };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, detail };
    }
  },

  async getAvailableSlots(ctx, { date, service, provider }): Promise<AdapterSlot[]> {
    const locationId = ctx.config.location_id;
    if (!locationId) {
      console.warn("BOULEVARD_CONFIG: missing config.location_id — returning []");
      return [];
    }

    // Boulevard uses a "BookableTimes" / "BookableStaffVariants" flow:
    //   1. Find the service(s) matching our free-text service name
    //   2. Fetch bookable times for that service on the given date
    // We resolve service by name match; staff/provider is best-effort.

    // Step 1 — resolve service id
    const svcQuery = `
      query($locationId: ID!) {
        services(locationId: $locationId, first: 200) {
          edges { node { id name category } }
        }
      }`;
    const svcRes = await graphql<{ services: { edges: Array<{ node: { id: string; name: string } }> } }>(
      ctx,
      svcQuery,
      { locationId }
    );
    const allServices = svcRes.data?.services?.edges?.map((e) => e.node) ?? [];
    const wanted = (service || "").toLowerCase().trim();
    const matchedService = wanted
      ? allServices.find((s) => s.name.toLowerCase().includes(wanted))
      : allServices[0];
    if (!matchedService) return [];

    // Step 2 — fetch bookable times
    const btQuery = `
      query($locationId: ID!, $serviceId: ID!, $date: Date!) {
        bookableTimes(
          locationId: $locationId,
          serviceIds: [$serviceId],
          date: $date
        ) {
          startTime
          staff { id firstName lastName }
        }
      }`;
    const btRes = await graphql<{
      bookableTimes: Array<{ startTime: string; staff?: { id: string; firstName: string; lastName: string } }>;
    }>(ctx, btQuery, { locationId, serviceId: matchedService.id, date });

    let times = btRes.data?.bookableTimes ?? [];

    // Provider filter — if the caller asked for a specific aesthetician
    if (provider && !/no preference|any|anyone/i.test(provider)) {
      const needle = provider.toLowerCase().replace(/dr\.?\s*/g, "").trim();
      times = times.filter((t) => {
        if (!t.staff) return false;
        const full = `${t.staff.firstName} ${t.staff.lastName}`.toLowerCase();
        return full.includes(needle);
      });
    }

    return times.map((t) => ({
      label: new Date(t.startTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      startTime: t.startTime,
      staffId: t.staff?.id,
      staffName: t.staff ? `${t.staff.firstName} ${t.staff.lastName}` : undefined,
      serviceId: matchedService.id,
    }));
  },

  async bookAppointment(ctx, input: AdapterBookingInput): Promise<AdapterBookingResult> {
    const locationId = ctx.config.location_id;
    if (!locationId) {
      return { ok: false, error: "Missing location_id", errorCode: "validation" };
    }

    // Boulevard appointment creation typically needs:
    //   - clientId (lookup or create)
    //   - locationId
    //   - bookableItems: [{ serviceId, staffId?, startAt }]
    // We do a two-step: find-or-create client, then create appointment.

    // Step 1 — find client by phone, else create
    const [firstName, ...rest] = input.customerName.trim().split(/\s+/);
    const lastName = rest.join(" ") || "-";

    let clientId: string | undefined;
    try {
      const findQuery = `
        query($phone: String!) {
          clients(filter: { mobilePhone: $phone }, first: 1) {
            edges { node { id } }
          }
        }`;
      const findRes = await graphql<{
        clients: { edges: Array<{ node: { id: string } }> };
      }>(ctx, findQuery, { phone: input.customerPhone });
      clientId = findRes.data?.clients?.edges?.[0]?.node?.id;
    } catch (err) {
      console.warn("BOULEVARD_CLIENT_LOOKUP_ERR:", err);
    }

    if (!clientId) {
      try {
        const createClientQuery = `
          mutation($input: ClientCreateInput!) {
            clientCreate(input: $input) { client { id } }
          }`;
        const createRes = await graphql<{
          clientCreate: { client: { id: string } };
        }>(ctx, createClientQuery, {
          input: {
            firstName,
            lastName,
            mobilePhone: input.customerPhone,
            email: input.customerEmail,
          },
        });
        clientId = createRes.data?.clientCreate?.client?.id;
      } catch (err) {
        console.error("BOULEVARD_CLIENT_CREATE_ERR:", err);
        return { ok: false, error: "Could not create client", errorCode: "validation" };
      }
    }
    if (!clientId) {
      return { ok: false, error: "No clientId resolved", errorCode: "validation" };
    }

    // Step 2 — create appointment
    try {
      const apptQuery = `
        mutation($input: AppointmentCreateInput!) {
          appointmentCreate(input: $input) {
            appointment { id startAt }
          }
        }`;
      const apptRes = await graphql<{
        appointmentCreate: { appointment: { id: string; startAt: string } };
      }>(ctx, apptQuery, {
        input: {
          clientId,
          locationId,
          bookableItems: [
            {
              serviceId: input.serviceId,
              staffId: input.staffId,
              startAt: input.startTime,
            },
          ],
          notes: input.notes,
        },
      });
      const appt = apptRes.data?.appointmentCreate?.appointment;
      if (!appt?.id) {
        return { ok: false, error: "Appointment creation returned no id", errorCode: "unknown" };
      }
      return { ok: true, appointmentId: appt.id };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("BOULEVARD_APPT_CREATE_ERR:", detail);
      return { ok: false, error: detail, errorCode: "network" };
    }
  },
};

export default adapter;
