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

  async parseWebhookEvent(ctx, { headers, rawBody }): Promise<AdapterWebhookEvent | null> {
    // Boulevard signs webhooks with HMAC-SHA256 using the shared secret
    // the admin stored in credentials.webhook_secret (set via the admin
    // integration page). Header name per their docs: "Blvd-Signature".
    const secret = ctx.credentials.webhook_secret;
    const sigHeader = headers["blvd-signature"] || headers["x-blvd-signature"];
    let signatureOk = false;
    if (secret && sigHeader) {
      try {
        const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
        const a = Buffer.from(expected, "hex");
        const b = Buffer.from(sigHeader.replace(/^sha256=/, ""), "hex");
        signatureOk = a.length === b.length && timingSafeEqual(a, b);
      } catch {
        signatureOk = false;
      }
    }

    let payload: {
      event?: string;
      type?: string;
      data?: {
        id?: string;
        startAt?: string;
        endAt?: string;
        state?: string;
        client?: { firstName?: string; lastName?: string; mobilePhone?: string };
        bookableItems?: Array<{
          service?: { name?: string };
          staff?: { firstName?: string; lastName?: string };
          price?: { amount?: number; currency?: string };
        }>;
      };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const rawType = (payload.event || payload.type || "").toLowerCase();
    const platformStatus = (payload.data?.state ?? "").toString();
    const externalId = payload.data?.id;
    if (!externalId) return null;

    // Normalize Boulevard event names to our neutral enum. Anything we
    // don't recognize returns null so the route quietly 200s without
    // touching calendar_events. Completion is inferred from either an
    // explicit event name OR an update event whose payload state reads
    // like a terminal paid/closed status (Boulevard sometimes sends it
    // as an appointment.updated with a state change rather than a
    // dedicated completed event).
    let eventType: AdapterWebhookEventType | null = null;
    const looksCompleted = /COMPLETED|CLOSED|PAID|FINISHED/i.test(platformStatus);
    if (rawType.includes("cancel")) eventType = "appointment.cancelled";
    else if (rawType.includes("reschedul")) eventType = "appointment.rescheduled";
    else if (rawType.includes("complete") || looksCompleted) eventType = "appointment.completed";
    else if (rawType.includes("create")) eventType = "appointment.created";
    else if (rawType.includes("update")) eventType = "appointment.updated";
    if (!eventType) return null;

    const item = payload.data?.bookableItems?.[0];
    const staffName = item?.staff
      ? `${item.staff.firstName ?? ""} ${item.staff.lastName ?? ""}`.trim() || undefined
      : undefined;
    const customerName = payload.data?.client
      ? `${payload.data.client.firstName ?? ""} ${payload.data.client.lastName ?? ""}`.trim() ||
        undefined
      : undefined;
    const priceCents =
      typeof item?.price?.amount === "number"
        ? Math.round(item.price.amount * 100)
        : undefined;

    return {
      signatureOk,
      eventType,
      externalId,
      startTime: payload.data?.startAt,
      endTime: payload.data?.endAt,
      serviceName: item?.service?.name,
      staffName,
      customerName,
      customerPhone: payload.data?.client?.mobilePhone,
      cancelled: eventType === "appointment.cancelled",
      priceCents,
      platformStatus: platformStatus || undefined,
    };
  },

  async listProviders(ctx): Promise<AdapterProvider[]> {
    const locationId = ctx.config.location_id;
    if (!locationId) return [];

    // Boulevard Staff query — firstName/lastName + jobTitle, plus the
    // services they can perform and a weekly schedule block. Field names
    // mirror their public GraphQL SDL; if a field is missing from a given
    // tenant's schema we simply leave it undefined (sync handles partials).
    const q = `
      query($locationId: ID!) {
        staff(locationId: $locationId, first: 200) {
          edges {
            node {
              id
              firstName
              lastName
              jobTitle
              active
              services(first: 100) { edges { node { name } } }
              schedule {
                monday    { openTime closeTime }
                tuesday   { openTime closeTime }
                wednesday { openTime closeTime }
                thursday  { openTime closeTime }
                friday    { openTime closeTime }
                saturday  { openTime closeTime }
                sunday    { openTime closeTime }
              }
            }
          }
        }
      }`;
    type StaffNode = {
      id: string;
      firstName?: string;
      lastName?: string;
      jobTitle?: string;
      active?: boolean;
      services?: { edges: Array<{ node: { name?: string } }> };
      schedule?: Record<string, { openTime?: string; closeTime?: string } | null>;
    };
    const res = await graphql<{ staff: { edges: Array<{ node: StaffNode }> } }>(ctx, q, { locationId });
    if (res.errors?.length) {
      throw new Error("Boulevard staff query: " + res.errors.map((e) => e.message).join("; "));
    }
    const edges = res.data?.staff?.edges ?? [];

    return edges
      .map(({ node: s }) => {
        const name = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
        if (!name) return null;
        const services = s.services?.edges
          ?.map((e) => e.node.name)
          .filter((n): n is string => Boolean(n));
        const workingHours: Record<string, { open: string; close: string }> = {};
        for (const [day, block] of Object.entries(s.schedule ?? {})) {
          if (block?.openTime && block?.closeTime) {
            workingHours[day] = { open: block.openTime, close: block.closeTime };
          }
        }
        return {
          externalId: s.id,
          name,
          title: s.jobTitle,
          services: services?.length ? services : undefined,
          workingHours: Object.keys(workingHours).length ? workingHours : undefined,
          active: s.active !== false,
        } as AdapterProvider;
      })
      .filter((p): p is AdapterProvider => p !== null);
  },

  async getClientHistory(ctx, { phone }) {
    // Find the client by phone, then pull their recent appointments.
    // Field names below mirror Boulevard's public GraphQL schema; if they
    // reject a query we log and return null so the caller never throws.
    try {
      const findQuery = `
        query($phone: String!) {
          clients(filter: { mobilePhone: $phone }, first: 1) {
            edges { node { id firstName lastName email } }
          }
        }`;
      const findRes = await graphql<{
        clients: {
          edges: Array<{
            node: { id: string; firstName?: string; lastName?: string; email?: string };
          }>;
        };
      }>(ctx, findQuery, { phone });
      const node = findRes.data?.clients?.edges?.[0]?.node;
      if (!node) return null;

      const apptQuery = `
        query($clientId: ID!) {
          client(id: $clientId) {
            appointments(first: 20, orderBy: { field: START_AT, direction: DESC }) {
              edges {
                node {
                  id
                  startAt
                  state
                  bookableItems {
                    service { name }
                    staff  { firstName lastName }
                    price  { amount currency }
                  }
                }
              }
            }
          }
        }`;
      const apptRes = await graphql<{
        client: {
          appointments: {
            edges: Array<{
              node: {
                id: string;
                startAt: string;
                state?: string;
                bookableItems?: Array<{
                  service?: { name?: string };
                  staff?: { firstName?: string; lastName?: string };
                  price?: { amount?: number; currency?: string };
                }>;
              };
            }>;
          };
        };
      }>(ctx, apptQuery, { clientId: node.id });

      const edges = apptRes.data?.client?.appointments?.edges ?? [];
      const visits = edges.map((e) => {
        const n = e.node;
        const item = n.bookableItems?.[0];
        const staff = item?.staff
          ? `${item.staff.firstName ?? ""} ${item.staff.lastName ?? ""}`.trim()
          : undefined;
        return {
          externalId: n.id,
          date: n.startAt,
          service: item?.service?.name,
          staff,
          priceCents:
            typeof item?.price?.amount === "number"
              ? Math.round(item.price.amount * 100)
              : undefined,
          status: n.state,
          raw: n,
        };
      });
      const lifetimeValueCents = visits
        .filter((v) => /COMPLETED|CLOSED|PAID/i.test(v.status || ""))
        .reduce((sum, v) => sum + (v.priceCents ?? 0), 0);

      return {
        clientId: node.id,
        firstName: node.firstName,
        lastName: node.lastName,
        email: node.email,
        visits,
        lifetimeValueCents: lifetimeValueCents || undefined,
      };
    } catch (err) {
      console.warn("BOULEVARD_HISTORY_ERR:", err);
      return null;
    }
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
