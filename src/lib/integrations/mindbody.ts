import { createHmac, timingSafeEqual } from "crypto";
import type {
  AdapterContext,
  AdapterSlot,
  AdapterAppointment,
  AdapterBookingInput,
  AdapterBookingResult,
  AdapterTestResult,
  AdapterWebhookEvent,
  AdapterWebhookEventType,
  AdapterProvider,
  AdapterClientRecord,
  BookingAdapter,
} from "./types";

/**
 * Mindbody Public API v6 adapter.
 * API docs: https://developers.mindbodyonline.com/PublicDocumentation/V6
 *
 * Auth is two-legged:
 *   1. Partner API key        → header Api-Key
 *   2. Staff user token        → obtained via /usertoken/issue using
 *      credentials.staff_username + credentials.staff_password
 *
 * Creds (set by admin):
 *   credentials.site_id          e.g. "-99" for sandbox, real numeric site ID in prod
 *   credentials.api_key          partner-level Mindbody Public API key
 *   credentials.source_name      the registered source/app name
 *   credentials.staff_username   site-level staff user w/ booking permission
 *   credentials.staff_password
 *   config.location_id           which physical location to book into
 *
 * Mindbody requires the partner app be approved + activated against the site
 * by the clinic owner — we walk them through that during onboarding.
 */

const BASE_URL = "https://api.mindbodyonline.com/public/v6";

/**
 * Coerce a Mindbody time value to "HH:MM". Mindbody is inconsistent —
 * sometimes "09:00", sometimes "1900-01-01T09:00:00" (an arbitrary date
 * with the time of day). Returns null when the input doesn't parse so
 * the caller can decide whether to drop the day.
 */
function toHHMM(t: string | undefined | null): string | null {
  if (!t) return null;
  // Already short form
  const short = /^(\d{2}):(\d{2})/.exec(t);
  if (short) return `${short[1]}:${short[2]}`;
  // ISO-ish — pull the time portion after the T
  const iso = /T(\d{2}):(\d{2})/.exec(t);
  if (iso) return `${iso[1]}:${iso[2]}`;
  return null;
}

/**
 * Map Mindbody's per-staff `Availabilities` array to our weekly
 * working_hours JSONB shape. Returns undefined if nothing parseable so
 * the writer falls through to null (sync preserves "no schedule data"
 * rather than fabricating one).
 */
function parseAvailabilities(
  rows: Array<{ DayOfWeek?: string; StartTime?: string; EndTime?: string }> | undefined
): Record<string, { open: string; close: string }> | undefined {
  if (!rows || rows.length === 0) return undefined;
  const out: Record<string, { open: string; close: string }> = {};
  for (const r of rows) {
    const day = r.DayOfWeek?.toLowerCase();
    const open = toHHMM(r.StartTime);
    const close = toHHMM(r.EndTime);
    if (!day || !open || !close) continue;
    // Multiple ranges per day collapse to widest open–close (rare for
    // appointment-style staff; common for class instructors with split
    // morning/afternoon shifts). Keep the earliest open and latest close.
    const existing = out[day];
    if (!existing) {
      out[day] = { open, close };
    } else {
      out[day] = {
        open: open < existing.open ? open : existing.open,
        close: close > existing.close ? close : existing.close,
      };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function getStaffToken(ctx: AdapterContext): Promise<string> {
  const { api_key, site_id, staff_username, staff_password } = ctx.credentials;
  if (!api_key || !site_id || !staff_username || !staff_password) {
    throw new Error("Missing Mindbody credentials (api_key/site_id/staff_username/staff_password)");
  }
  const res = await fetch(`${BASE_URL}/usertoken/issue`, {
    method: "POST",
    headers: {
      "Api-Key": api_key,
      SiteId: site_id,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ Username: staff_username, Password: staff_password }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mindbody token ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { AccessToken?: string };
  if (!json.AccessToken) throw new Error("Mindbody: no AccessToken in response");
  return json.AccessToken;
}

async function mbFetch<T = unknown>(
  ctx: AdapterContext,
  path: string,
  init: RequestInit & { authed?: boolean } = {}
): Promise<T> {
  const { api_key, site_id, source_name } = ctx.credentials;
  if (!api_key || !site_id) throw new Error("Missing Mindbody api_key / site_id");

  const headers: Record<string, string> = {
    "Api-Key": api_key,
    SiteId: site_id,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (source_name) headers.SourceName = source_name;
  if (init.authed) {
    headers.Authorization = `Bearer ${await getStaffToken(ctx)}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mindbody ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

interface MbService {
  Id: number;
  Name: string;
  Category?: string;
  ProductId?: number;
  SessionType?: { Id?: number; Name?: string };
}

interface MbStaff {
  Id: number;
  Name?: string;
  FirstName?: string;
  LastName?: string;
}

interface MbBookableItem {
  StartDateTime: string;
  EndDateTime: string;
  Staff?: MbStaff;
  SessionType?: { Id?: number; Name?: string };
  LocationId?: number;
}

interface MbAddClientResponse {
  Client?: { Id?: string; UniqueId?: number };
}

const adapter: BookingAdapter = {
  platform: "mindbody",

  async testConnection(ctx): Promise<AdapterTestResult> {
    try {
      const res = await mbFetch<{ Locations?: { Name?: string; BusinessDescription?: string }[] }>(
        ctx,
        "/site/locations"
      );
      const loc = res?.Locations?.[0];
      return { ok: true, businessName: loc?.BusinessDescription || loc?.Name };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async getAvailableSlots(ctx, { date, service, provider }): Promise<AdapterSlot[]> {
    const locationId = ctx.config.location_id;
    // 1. Resolve service → SessionTypeId
    const servicesRes = await mbFetch<{ Services?: MbService[] }>(
      ctx,
      `/sale/services${locationId ? `?LocationId=${locationId}` : ""}`
    );
    const services = servicesRes?.Services ?? [];
    const wanted = (service || "").toLowerCase().trim();
    const svc = wanted ? services.find((s) => (s.Name || "").toLowerCase().includes(wanted)) : services[0];
    const sessionTypeId = svc?.SessionType?.Id;
    if (!sessionTypeId) return [];

    // 2. Optionally resolve staff
    let staffId: number | undefined;
    if (provider && !/no preference|any|anyone/i.test(provider)) {
      const needle = provider.toLowerCase().replace(/dr\.?\s*/g, "").trim();
      const staffRes = await mbFetch<{ StaffMembers?: MbStaff[] }>(ctx, "/staff/staff");
      const matched = (staffRes?.StaffMembers ?? []).find((s) => {
        const n = (s.Name || `${s.FirstName ?? ""} ${s.LastName ?? ""}`).toLowerCase();
        return n.includes(needle) || needle.split(/\s+/).some((p) => p.length > 2 && n.includes(p));
      });
      if (!matched) return [];
      staffId = matched.Id;
    }

    // 3. Query bookable items
    const params = new URLSearchParams({
      SessionTypeIds: String(sessionTypeId),
      StartDate: date,
      EndDate: date,
    });
    if (locationId) params.set("LocationIds", locationId);
    if (staffId) params.set("StaffIds", String(staffId));

    const bookable = await mbFetch<{ Availabilities?: MbBookableItem[] }>(
      ctx,
      `/appointment/bookableitems?${params}`
    );
    const items = bookable?.Availabilities ?? [];
    return items.map((it) => ({
      label: new Date(it.StartDateTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      startTime: it.StartDateTime,
      serviceId: String(sessionTypeId),
      staffId: it.Staff?.Id ? String(it.Staff.Id) : staffId ? String(staffId) : undefined,
      staffName: it.Staff?.Name,
    }));
  },

  async listProviders(ctx): Promise<AdapterProvider[]> {
    // /staff/staff returns active staff for the site (scoped to LocationId
    // when supplied). Filters=AppointmentInstructor narrows to staff who
    // actually take bookings (skips reception/owner/sentinel rows).
    //
    // Two Mindbody-specific quirks worth knowing:
    //   1. JobTitles isn't returned by default — would need a separate
    //      /staff/staffpermissions call. Title stays null until that work.
    //   2. Mindbody doesn't return an `Active` field on default-listed
    //      staff (the endpoint pre-filters to active). active=true is
    //      therefore the safe default; deactivation is detected at sync
    //      time when a previously-seen externalId disappears from the
    //      response (handled in provider-sync.ts).
    //   3. Services per staff are NOT on /staff/staff. They live in the
    //      session-type ↔ staff matrix that requires a /sale/services
    //      join. Left empty here — see the "richer staff" follow-up.
    const locationId = ctx.config.location_id;
    const filterClause = "Filters=AppointmentInstructor";
    const locClause = locationId ? `&LocationId=${encodeURIComponent(locationId)}` : "";
    const path = `/staff/staff?${filterClause}${locClause}&Limit=200`;

    interface MbAvailability {
      DayOfWeek?: string;       // "Monday" | "Tuesday" | ...
      StartTime?: string;       // "1900-01-01T09:00:00" or "09:00"
      EndTime?: string;
    }
    interface MbStaffRow {
      Id: number;
      FirstName?: string;
      LastName?: string;
      Name?: string;
      DisplayName?: string;
      Bio?: string;
      AlwaysAllowDoubleBooking?: boolean;
      IndependentContractor?: boolean;
      /** Mindbody returns a JobTitles array per staffer when permissioned */
      JobTitles?: Array<{ Name?: string }>;
      Availabilities?: MbAvailability[];
    }
    const res = await mbFetch<{ StaffMembers?: MbStaffRow[] }>(ctx, path);
    const rows = res?.StaffMembers ?? [];

    return rows
      .map((s) => {
        const name =
          s.DisplayName?.trim() ||
          s.Name?.trim() ||
          `${s.FirstName ?? ""} ${s.LastName ?? ""}`.trim();
        if (!name) return null;
        return {
          externalId: String(s.Id),
          name,
          title: s.JobTitles?.[0]?.Name,
          bio: s.Bio?.trim() || undefined,
          workingHours: parseAvailabilities(s.Availabilities),
          // No Active field on /staff/staff — provider-sync handles
          // deactivation by tracking which IDs disappear between syncs.
          active: true,
        } as AdapterProvider;
      })
      .filter((p): p is AdapterProvider => p !== null);
  },

  async listAppointments(ctx, { since, until }): Promise<AdapterAppointment[]> {
    // Mindbody's /appointment/staffappointments requires StaffIds. We
    // pull the active roster first, then page through appointments per
    // 30-day window (the endpoint caps date ranges at 31 days). Staff
    // tokens are required — addclient/staff appointment data is gated.
    const locationId = ctx.config.location_id;
    const staffPath = locationId
      ? `/staff/staff?LocationId=${encodeURIComponent(locationId)}&Limit=200`
      : "/staff/staff?Limit=200";
    const staffRes = await mbFetch<{ StaffMembers?: { Id: number }[] }>(ctx, staffPath);
    const staffIds = (staffRes?.StaffMembers ?? []).map((s) => s.Id);
    if (staffIds.length === 0) return [];
    const staffParam = staffIds.join(",");

    interface MbAppointment {
      Id: number;
      StartDateTime: string;
      EndDateTime?: string;
      Status?: string;
      ClientId?: string;
      Client?: { FirstName?: string; LastName?: string; MobilePhone?: string; Phone?: string };
      Staff?: { Id?: number; Name?: string };
      SessionType?: { Name?: string };
    }

    const out: AdapterAppointment[] = [];
    const chunkDays = 30;
    let cursor = new Date(since);
    const end = new Date(until);

    while (cursor < end) {
      const chunkEnd = new Date(Math.min(cursor.getTime() + chunkDays * 86_400_000, end.getTime()));
      const startDate = cursor.toISOString().slice(0, 10);
      const endDate = chunkEnd.toISOString().slice(0, 10);

      let offset = 0;
      const PAGE = 200;
      while (true) {
        const params = new URLSearchParams({
          StaffIds: staffParam,
          StartDate: startDate,
          EndDate: endDate,
          Limit: String(PAGE),
          Offset: String(offset),
        });
        if (locationId) params.set("LocationIds", locationId);

        const page = await mbFetch<{ StaffAppointments?: MbAppointment[] }>(
          ctx,
          `/appointment/staffappointments?${params}`,
          { authed: true }
        );
        const rows = page?.StaffAppointments ?? [];
        for (const a of rows) {
          if (!a.StartDateTime) continue;
          const raw = (a.Status || "").trim();
          let status: AdapterAppointment["status"] = "confirmed";
          if (/cancel|no ?show/i.test(raw)) status = "cancelled";
          else if (/complet|closed|paid/i.test(raw)) status = "completed";

          const customerName = [a.Client?.FirstName, a.Client?.LastName]
            .filter(Boolean)
            .join(" ") || undefined;

          out.push({
            externalId: String(a.Id),
            startTime: a.StartDateTime,
            endTime: a.EndDateTime,
            serviceName: a.SessionType?.Name,
            staffName: a.Staff?.Name,
            customerName,
            customerPhone: a.Client?.MobilePhone || a.Client?.Phone,
            status,
            platformStatus: raw || undefined,
          });
        }
        if (rows.length < PAGE) break;
        offset += PAGE;
      }

      // Advance cursor by chunkDays (exclusive of the prior endDate to
      // avoid double-counting an appointment that straddles midnight)
      cursor = new Date(chunkEnd.getTime() + 86_400_000);
    }

    return out;
  },

  async listClients(ctx, { modifiedSince, limit } = {}): Promise<AdapterClientRecord[]> {
    // Mindbody's /client/clients returns the directory. Authed (PII).
    // `LastModifiedDate` filters server-side to clients touched after a
    // given ISO date — handy for incremental syncs after the first.
    //
    // Many records have null phones in `-99` and even in some real
    // tenants who never collected mobile numbers; we still return them
    // here and let the orchestrator decide whether to skip-on-no-phone.
    interface MbClient {
      Id?: string;
      UniqueId?: number;
      FirstName?: string;
      LastName?: string;
      Email?: string;
      MobilePhone?: string;
      HomePhone?: string;
      WorkPhone?: string;
      LastModifiedDateTime?: string;
      CreationDate?: string;
    }

    const PAGE = 200;
    const HARD_CAP = limit ?? 2000; // ceiling so a 50k-client clinic doesn't run forever
    const out: AdapterClientRecord[] = [];
    let offset = 0;

    while (out.length < HARD_CAP) {
      const params = new URLSearchParams({
        Limit: String(Math.min(PAGE, HARD_CAP - out.length)),
        Offset: String(offset),
      });
      if (modifiedSince) params.set("LastModifiedDate", modifiedSince);

      const page = await mbFetch<{ Clients?: MbClient[] }>(
        ctx,
        `/client/clients?${params}`,
        { authed: true }
      );
      const rows = page?.Clients ?? [];
      for (const c of rows) {
        const externalId = c.Id?.toString() || (c.UniqueId !== undefined ? String(c.UniqueId) : null);
        if (!externalId) continue;
        out.push({
          externalId,
          firstName: c.FirstName?.trim() || undefined,
          lastName: c.LastName?.trim() || undefined,
          email: c.Email?.trim() || undefined,
          // Prefer mobile (more likely to match a voice call). Fall through
          // to home/work so a clinic that only collected a single number
          // still matches.
          phone: c.MobilePhone || c.HomePhone || c.WorkPhone || undefined,
          lastModified: c.LastModifiedDateTime,
        });
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }

    return out;
  },

  async parseWebhookEvent(ctx, { headers, rawBody }): Promise<AdapterWebhookEvent | null> {
    // Mindbody's Webhooks API (separate product from Public API v6).
    // Signature: base64(HMAC-SHA256(rawBody, subscription_secret)),
    // header X-Mindbody-Signature. The secret is returned when the admin
    // creates the subscription; we store it on credentials.webhook_secret.
    // https://developers.mindbodyonline.com/WebhooksDocumentation
    const secret = ctx.credentials.webhook_secret;
    const sigHeader = headers["x-mindbody-signature"];
    let signatureOk = false;
    if (secret && sigHeader) {
      try {
        const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
        const a = Buffer.from(expected, "base64");
        const b = Buffer.from(sigHeader.replace(/^sha256=/, ""), "base64");
        signatureOk = a.length === b.length && timingSafeEqual(a, b);
      } catch {
        signatureOk = false;
      }
    }

    let payload: {
      eventId?: string;
      eventData?: {
        appointmentId?: number | string;
        startDateTime?: string;
        endDateTime?: string;
        staffId?: number;
        staffName?: string;
        sessionTypeName?: string;
        appointmentStatus?: string;
        clientFirstName?: string;
        clientLastName?: string;
        clientPhone?: string;
        clientMobilePhone?: string;
      };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const raw = (payload.eventId || "").toLowerCase();
    const d = payload.eventData;
    if (!d?.appointmentId) return null;

    let eventType: AdapterWebhookEventType | null = null;
    if (raw.includes("cancel")) eventType = "appointment.cancelled";
    else if (raw.includes("reschedul")) eventType = "appointment.rescheduled";
    else if (raw.includes("creat") || raw.includes("book")) eventType = "appointment.created";
    else if (raw.includes("updat")) eventType = "appointment.updated";
    if (!eventType) return null;

    // Mindbody sometimes signals cancellation via appointmentStatus instead
    // of a distinct event — honor both.
    const cancelled =
      eventType === "appointment.cancelled" ||
      /cancel|no ?show/i.test(d.appointmentStatus || "");

    const customerName =
      [d.clientFirstName, d.clientLastName].filter(Boolean).join(" ") || undefined;

    return {
      signatureOk,
      eventType,
      externalId: String(d.appointmentId),
      startTime: d.startDateTime,
      endTime: d.endDateTime,
      serviceName: d.sessionTypeName,
      staffName: d.staffName,
      customerName,
      customerPhone: d.clientMobilePhone || d.clientPhone,
      cancelled,
    };
  },

  async bookAppointment(ctx, input: AdapterBookingInput): Promise<AdapterBookingResult> {
    if (!input.serviceId) {
      return { ok: false, error: "Missing serviceId (SessionTypeId)", errorCode: "validation" };
    }
    if (!input.staffId) {
      return { ok: false, error: "Missing staffId (Mindbody requires staff)", errorCode: "validation" };
    }

    const locationId = ctx.config.location_id;
    const [firstName, ...rest] = input.customerName.trim().split(/\s+/);
    const lastName = rest.join(" ") || "-";

    try {
      // 1. Upsert client (AddClient is idempotent on phone for our purposes —
      //    if it already exists Mindbody returns a 400 and we fall through to
      //    a name-based lookup).
      let clientId: string | undefined;
      try {
        const added = await mbFetch<MbAddClientResponse>(ctx, "/client/addclient", {
          method: "POST",
          authed: true,
          body: JSON.stringify({
            FirstName: firstName,
            LastName: lastName,
            MobilePhone: input.customerPhone,
            Email: input.customerEmail,
          }),
        });
        clientId = added?.Client?.Id;
      } catch {
        const found = await mbFetch<{ Clients?: { Id?: string }[] }>(
          ctx,
          `/client/clients?SearchText=${encodeURIComponent(input.customerPhone)}`,
          { authed: true }
        );
        clientId = found?.Clients?.[0]?.Id;
      }
      if (!clientId) {
        return { ok: false, error: "Could not resolve Mindbody client", errorCode: "validation" };
      }

      // 2. Book
      const res = await mbFetch<{ Appointment?: { Id?: number } }>(ctx, "/appointment/addappointment", {
        method: "POST",
        authed: true,
        body: JSON.stringify({
          ClientId: clientId,
          LocationId: locationId ? Number(locationId) : undefined,
          SessionTypeId: Number(input.serviceId),
          StaffId: Number(input.staffId),
          StartDateTime: input.startTime,
          Notes: input.notes,
          SendEmail: Boolean(input.customerEmail),
        }),
      });
      const apptId = res?.Appointment?.Id;
      if (!apptId) return { ok: false, error: "No appointment ID returned", errorCode: "unknown" };
      return { ok: true, appointmentId: String(apptId) };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const unavailable = /not available|conflict|unavailable|overlap/i.test(detail);
      console.error("MINDBODY_BOOK_ERR:", detail);
      return {
        ok: false,
        error: detail,
        errorCode: unavailable ? "unavailable" : "network",
      };
    }
  },
};

export default adapter;
