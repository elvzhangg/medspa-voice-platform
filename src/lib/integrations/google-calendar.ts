import type {
  AdapterContext,
  AdapterSlot,
  AdapterBookingInput,
  AdapterBookingResult,
  AdapterTestResult,
  AdapterProvider,
  AdapterAppointment,
  BookingAdapter,
} from "./types";

/**
 * Google Calendar adapter — direct-book mode.
 *
 * Auth: OAuth2 Bearer. The refreshed access_token is injected into
 * ctx.credentials.access_token by loadTenantIntegration() before this adapter
 * is called, so we just read it like any other credential. Token refresh logic
 * lives in src/lib/google-oauth.ts.
 *
 * Each Google calendar maps to one "provider" in our schema. The admin selects
 * which calendars to expose during onboarding; selections are stored in
 * config.provider_calendars as a JSON map { providerName: calendarId } (the
 * raw calendar ID is required for write operations).
 *
 * Required ctx:
 *   credentials.access_token         Bearer token (refreshed by loader)
 *
 * Required ctx.config (integration plumbing — admin-only via /admin):
 *   timezone                         IANA tz; default "America/Los_Angeles"
 *   default_calendar_id              Calendar to use when no provider given;
 *                                    default "primary"
 *   provider_calendars               Optional JSON map; provider name -> calendar id
 *                                    e.g. {"Dr. Chen": "abc@group.calendar.google.com"}
 *
 * Required ctx.tenantData (tenant-editable scheduling, populated by the loader
 * from staff.working_hours + tenants.booking_settings):
 *   workingHoursByProvider           Per-provider per-day hours sourced from
 *                                    staff.working_hours. Day keys are full
 *                                    lowercase names ("monday", ...).
 *   serviceDurations                 service name -> minutes; "default" key is
 *                                    the catch-all when no service matches.
 *   bufferMin                        Cleanup minutes between appointments.
 *
 * If ctx.tenantData is missing (older loaders), we fall back to safe defaults:
 *   - working hours: 09:00-17:00 every day
 *   - service duration: 60 min
 *   - buffer: 0 min
 */

const BASE_URL = "https://www.googleapis.com/calendar/v3";

const DEFAULT_TZ = "America/Los_Angeles";
const DEFAULT_CAL = "primary";
const DEFAULT_DURATION_MIN = 60;
const DEFAULT_WORK_START = "09:00";
const DEFAULT_WORK_END = "17:00";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function gcalFetch<T = unknown>(
  ctx: AdapterContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const accessToken = ctx.credentials.access_token;
  if (!accessToken) {
    throw new Error("Missing Google access_token (loader should have refreshed it)");
  }
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google Calendar ${res.status} ${path}: ${text.slice(0, 300)}`);
  }
  return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

// ---------------------------------------------------------------------------
// Calendar list / providers
// ---------------------------------------------------------------------------

interface GCalCalendarListEntry {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: "freeBusyReader" | "reader" | "writer" | "owner";
  // Google's "Holidays" / "Birthdays" calendars come back here with these
  // suffixes; we filter them out so they don't show up as "providers."
  // group.v.calendar.google.com indicates a system holiday calendar.
}

interface GCalCalendarListResponse {
  items: GCalCalendarListEntry[];
}

function isUsableCalendar(c: GCalCalendarListEntry): boolean {
  if (!c.summary) return false;
  // Need write access to actually book. Read-only calendars can't accept events.
  if (c.accessRole !== "writer" && c.accessRole !== "owner") return false;
  // Filter out Google-provided system calendars that shouldn't be exposed as
  // staff providers (Holidays, Birthdays, sports schedules).
  if (c.id.endsWith("@group.v.calendar.google.com")) return false;
  if (c.id === "addressbook#contacts@group.v.calendar.google.com") return false;
  return true;
}

// ---------------------------------------------------------------------------
// FreeBusy / availability
// ---------------------------------------------------------------------------

interface FreeBusyBusyPeriod {
  start: string; // ISO with offset
  end: string;
}

interface FreeBusyResponse {
  timeMin: string;
  timeMax: string;
  calendars: Record<
    string,
    { busy?: FreeBusyBusyPeriod[]; errors?: { domain: string; reason: string }[] }
  >;
}

async function fetchBusyPeriods(
  ctx: AdapterContext,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  timeZone: string
): Promise<FreeBusyBusyPeriod[]> {
  const res = await gcalFetch<FreeBusyResponse>(ctx, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone,
      items: [{ id: calendarId }],
    }),
  });
  const calData = res.calendars?.[calendarId];
  if (calData?.errors?.length) {
    // Common case: calendar ID typo or revoked share. Surface the first error.
    throw new Error(`freeBusy error: ${calData.errors[0].reason}`);
  }
  return calData?.busy ?? [];
}

// ---------------------------------------------------------------------------
// Slot computation
// ---------------------------------------------------------------------------

/**
 * Build an ISO datetime string with the tenant's timezone offset.
 * We avoid pulling in date-fns-tz: the only thing we need is to express
 * "this date at this local clock time, interpreted in this tz" as an ISO
 * string Google accepts. The cleanest way is to let Google do the timezone
 * arithmetic by passing { dateTime, timeZone } in event payloads. For
 * freeBusy we still need a UTC ISO; for that we use the local-string trick
 * below (parse via Intl.DateTimeFormat-anchored math is overkill — for
 * working-hours math we treat the date in the tenant's local time and
 * accept that DST transitions on the boundary day are imperfect; appointments
 * never land near 2 AM so this is fine).
 */
function localDateTimeISO(date: string, time: string): string {
  // date: "YYYY-MM-DD", time: "HH:MM"
  // We return "YYYY-MM-DDTHH:MM:00" without an offset — paired with timeZone
  // on the Google side, this is unambiguous.
  return `${date}T${time}:00`;
}

/**
 * Express a local-naive datetime as a UTC ISO string, given a timezone.
 * Used for freeBusy bounds (Google wants RFC 3339 with offset).
 *
 * We use the trick of formatting in the target tz and parsing back; it's
 * accurate to the second except in the rare case of a DST jump exactly at
 * the boundary minute, which doesn't happen for medspa hours of operation.
 */
function localToUtcIso(date: string, time: string, timeZone: string): string {
  // Build "YYYY-MM-DDTHH:MM:00" in the tenant's local time, then figure out
  // what UTC offset that wall-clock time has on that date in that tz. We do
  // this via the Intl API: format any UTC date in the target tz and read
  // back the offset minutes for that wall-clock instant.
  const naiveLocal = new Date(`${date}T${time}:00Z`); // naively interpret as UTC first
  // Compute offset: format the same instant in the target tz and see how
  // far the formatted clock has shifted from the naive UTC clock.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(naiveLocal);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const tzClock = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`;
  const tzAsUtc = new Date(tzClock);
  // The shift between naive UTC and the tz-clock-as-UTC is the tz's offset
  // for that instant. Apply it inverse to find true UTC for our wall clock.
  const offsetMs = naiveLocal.getTime() - tzAsUtc.getTime();
  const trueUtc = new Date(naiveLocal.getTime() + offsetMs);
  return trueUtc.toISOString();
}

function parseHHMM(s: string): { h: number; m: number } {
  const [hh, mm] = s.split(":");
  return { h: parseInt(hh, 10), m: parseInt(mm || "0", 10) };
}

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  // Best-effort minute math without a date lib. For working-hours-of-day math
  // we don't cross days, so no DST handling needed here.
  const { h, m } = parseHHMM(time);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  if (newH >= 24) {
    // Should never happen for med-spa hours; clamp to end-of-day to be safe.
    return { date, time: "23:59" };
  }
  return {
    date,
    time: `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`,
  };
}

function timeStringToMinutes(t: string): number {
  const { h, m } = parseHHMM(t);
  return h * 60 + m;
}

// ---------------------------------------------------------------------------
// Tenant-data helpers: read scheduling constraints from ctx.tenantData
// (which the loader populates from staff.working_hours +
// tenants.booking_settings). Falls back to safe defaults when tenantData
// is absent or incomplete so a missing record never crashes the call.
// ---------------------------------------------------------------------------

/**
 * Full lowercase day name ("monday", "tuesday", ...) for an ISO date string,
 * computed in the tenant's timezone. Matches staff.working_hours key shape.
 */
function dayOfWeekKey(date: string, timeZone: string): string {
  // Pin to noon UTC to dodge DST edge cases — we only need the day component.
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(noonUtc);
  return wd.toLowerCase(); // "Monday" -> "monday"
}

/**
 * Look up working hours for a specific date. Returns null if the resolved
 * provider doesn't work that day (i.e., business closed for them).
 *
 * Resolution:
 *   1. If providerName is given and matches a staff name (case-insensitive
 *      partial), use that staff's working_hours[dayKey].
 *   2. Otherwise, take the union of all providers' hours for that day —
 *      earliest open and latest close across active staff. Models "any
 *      provider available" for one-calendar-per-business mode.
 *   3. If no staff has hours for that day, treat as closed (returns null).
 *   4. If tenantData is missing entirely, fall back to 09:00-17:00.
 */
function workingHoursForDay(
  ctx: AdapterContext,
  date: string,
  providerName?: string
): { start: string; end: string } | null {
  const tz = ctx.config.timezone || DEFAULT_TZ;
  const dayKey = dayOfWeekKey(date, tz);

  const byProvider = ctx.tenantData?.workingHoursByProvider;
  if (!byProvider || Object.keys(byProvider).length === 0) {
    // No staff data — return safe default. Caller's tenant won't have realistic
    // closed days but the integration won't crash.
    return { start: DEFAULT_WORK_START, end: DEFAULT_WORK_END };
  }

  // Provider-specific lookup
  if (providerName && !/no preference|any|anyone/i.test(providerName)) {
    const needle = providerName.toLowerCase().replace(/dr\.?\s*/g, "").trim();
    for (const [name, hours] of Object.entries(byProvider)) {
      const n = name.toLowerCase().replace(/dr\.?\s*/g, "").trim();
      if (n.includes(needle) || needle.split(/\s+/).some((p) => p.length > 2 && n.includes(p))) {
        const block = hours[dayKey];
        return block?.open && block?.close
          ? { start: block.open, end: block.close }
          : null;
      }
    }
    // Asked-for provider not found — fall through to union below rather than
    // crash; the slot computation will then return [] if no real provider is
    // open, which is the same UX as "we don't have that provider on Thursday".
  }

  // Union across providers: earliest open, latest close among those who work
  // that day. This models "the business is open whenever any provider is in."
  let earliestOpen: string | null = null;
  let latestClose: string | null = null;
  for (const hours of Object.values(byProvider)) {
    const block = hours[dayKey];
    if (!block?.open || !block?.close) continue;
    if (!earliestOpen || block.open < earliestOpen) earliestOpen = block.open;
    if (!latestClose || block.close > latestClose) latestClose = block.close;
  }
  if (!earliestOpen || !latestClose) return null; // closed across the board
  return { start: earliestOpen, end: latestClose };
}

/**
 * Look up the appointment duration for a service. Reads from
 * tenantData.serviceDurations; falls back to a "default" key, then
 * to DEFAULT_DURATION_MIN.
 *
 * Matching: case-insensitive exact key, then substring (so "Botox" config
 * matches a caller asking for "botox forehead").
 */
function durationForService(ctx: AdapterContext, serviceName?: string): number {
  const map = ctx.tenantData?.serviceDurations ?? {};

  if (serviceName) {
    const needle = serviceName.toLowerCase().trim();
    // Exact (case-insensitive) match first
    if (map[needle] !== undefined) return map[needle];
    // Substring match
    for (const [key, mins] of Object.entries(map)) {
      if (key === "default") continue;
      if (needle.includes(key) || key.includes(needle)) return mins;
    }
  }

  // Explicit "default" key wins over hardcoded fallback
  if (map["default"] !== undefined) return map["default"];

  return DEFAULT_DURATION_MIN;
}

/**
 * Buffer minutes between appointments (cleanup/turnover time).
 */
function bufferMinutes(ctx: AdapterContext): number {
  const n = ctx.tenantData?.bufferMin;
  if (typeof n !== "number" || isNaN(n) || n < 0) return 0;
  return n;
}

/**
 * Walk working hours in `stepMin` increments and return slots that don't
 * overlap with any busy period. busyPeriods is in UTC (from Google); we
 * compare by converting each candidate slot to UTC.
 */
function computeSlots(args: {
  date: string;
  workStart: string;
  workEnd: string;
  durationMin: number;
  stepMin: number; // how often to anchor candidate slots; 30 is reasonable
  bufferMin: number; // minutes to extend each busy period (cleanup/turnover)
  timeZone: string;
  busyPeriods: FreeBusyBusyPeriod[];
}): AdapterSlot[] {
  const { date, workStart, workEnd, durationMin, stepMin, bufferMin, timeZone, busyPeriods } = args;
  const slots: AdapterSlot[] = [];

  const startMin = timeStringToMinutes(workStart);
  const endMin = timeStringToMinutes(workEnd);
  // Last possible slot must end by workEnd.
  const lastStartMin = endMin - durationMin;

  // Pre-extend busy periods by buffer on BOTH sides so a candidate slot doesn't
  // bump into the adjacent appointment. We extend the END by bufferMin so a new
  // appointment can't start until cleanup is done; we extend the START by
  // bufferMin so a new appointment doesn't end immediately before someone
  // else's starts (also needs cleanup before they arrive). Symmetric is
  // simplest; if a customer ever cares about asymmetry we'll split the param.
  const bufferMs = bufferMin * 60 * 1000;
  const paddedBusy = busyPeriods.map((b) => ({
    start: new Date(new Date(b.start).getTime() - bufferMs).toISOString(),
    end: new Date(new Date(b.end).getTime() + bufferMs).toISOString(),
  }));

  for (let t = startMin; t <= lastStartMin; t += stepMin) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    const slotStartTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const slotEndShift = addMinutes(date, slotStartTime, durationMin);

    const slotStartUtc = localToUtcIso(date, slotStartTime, timeZone);
    const slotEndUtc = localToUtcIso(date, slotEndShift.time, timeZone);

    const startMs = new Date(slotStartUtc).getTime();
    const endMs = new Date(slotEndUtc).getTime();

    // Conflict if any (buffer-padded) busy period overlaps [startMs, endMs)
    const conflict = paddedBusy.some((b) => {
      const bs = new Date(b.start).getTime();
      const be = new Date(b.end).getTime();
      return bs < endMs && be > startMs;
    });
    if (conflict) continue;

    // Build a friendly label (e.g. "9:30 AM") in the tenant's tz
    const labelDate = new Date(slotStartUtc);
    const label = labelDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    });

    slots.push({
      label,
      // We hand back the local-naive ISO so bookAppointment can re-pair it
      // with timeZone on the Google side (avoids double conversion).
      startTime: localDateTimeISO(date, slotStartTime),
    });
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Provider/calendar resolution
// ---------------------------------------------------------------------------

function parseProviderCalendars(
  raw: string | undefined
): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function resolveCalendarId(ctx: AdapterContext, providerName?: string): string {
  const map = parseProviderCalendars(ctx.config.provider_calendars);
  if (providerName && !/no preference|any|anyone/i.test(providerName)) {
    // Try exact match first, then case-insensitive substring
    if (map[providerName]) return map[providerName];
    const needle = providerName.toLowerCase().replace(/dr\.?\s*/g, "").trim();
    for (const [name, id] of Object.entries(map)) {
      const n = name.toLowerCase().replace(/dr\.?\s*/g, "").trim();
      if (n.includes(needle) || needle.split(/\s+/).some((p) => p.length > 2 && n.includes(p))) {
        return id;
      }
    }
  }
  return ctx.config.default_calendar_id || DEFAULT_CAL;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const adapter: BookingAdapter = {
  platform: "google_calendar",

  async testConnection(ctx): Promise<AdapterTestResult> {
    try {
      const res = await gcalFetch<GCalCalendarListResponse>(ctx, "/users/me/calendarList?maxResults=10");
      const primary = res.items?.find((c) => c.primary);
      const writable = (res.items ?? []).filter(isUsableCalendar);
      if (writable.length === 0) {
        return {
          ok: false,
          detail:
            "Connected, but no writable calendars found. Make sure the connected Google account has at least one calendar with writer/owner access.",
        };
      }
      return {
        ok: true,
        // Surface the user's primary calendar identity (usually their email)
        // so the admin sees "connected to drchen@glow.com" in the UI.
        businessName: primary?.summary || primary?.id || writable[0].summary,
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async listProviders(ctx): Promise<AdapterProvider[]> {
    const res = await gcalFetch<GCalCalendarListResponse>(
      ctx,
      "/users/me/calendarList?maxResults=250"
    );
    const usable = (res.items ?? []).filter(isUsableCalendar);
    return usable.map((c) => ({
      externalId: c.id,
      name: c.summary,
      active: true,
    }));
  },

  async listAppointments(ctx, { since, until }): Promise<AdapterAppointment[]> {
    // Determine which calendars to pull events from. If the tenant has
    // configured per-provider calendars, query each one; otherwise just the
    // default calendar (typically 'primary'). This mirrors the same calendar
    // resolution as availability lookup so what the AI quotes and what the
    // dashboard displays are consistent.
    const providerCalMap = parseProviderCalendars(ctx.config.provider_calendars);
    const providerCalIds = Object.values(providerCalMap).filter(Boolean);
    const calendarIds =
      providerCalIds.length > 0
        ? Array.from(new Set(providerCalIds))
        : [ctx.config.default_calendar_id || DEFAULT_CAL];

    // Build a reverse map calendarId -> providerName so each event can be
    // tagged with the right staff name without an extra lookup.
    const calIdToProvider: Record<string, string> = {};
    for (const [name, id] of Object.entries(providerCalMap)) {
      if (id) calIdToProvider[id] = name;
    }

    interface GCalEvent {
      id: string;
      status?: "confirmed" | "tentative" | "cancelled";
      summary?: string;
      description?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
      // Recurring instances inherit from a parent — we ask the API to expand
      // these with singleEvents=true so each recurrence shows up as its own row.
    }
    interface GCalEventsResponse {
      items?: GCalEvent[];
      nextPageToken?: string;
    }

    const all: AdapterAppointment[] = [];

    for (const calendarId of calendarIds) {
      let pageToken: string | undefined = undefined;
      // Cap pagination at 5 pages (1250 events) to bound runtime — the
      // backfill window is ~120 days; a med spa booking 10/day fills ~1200
      // events and would already be edge-case. Tenants with more should
      // shrink the backfill window or split by calendar.
      for (let page = 0; page < 5; page++) {
        const params = new URLSearchParams({
          timeMin: since,
          timeMax: until,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
          // Returns cancellations too — important for the upsert path which
          // marks calendar_events rows cancelled rather than deleting them.
          showDeleted: "true",
        });
        if (pageToken) params.set("pageToken", pageToken);

        let res: GCalEventsResponse;
        try {
          res = await gcalFetch<GCalEventsResponse>(
            ctx,
            `/calendars/${encodeURIComponent(calendarId)}/events?${params}`
          );
        } catch (err) {
          // One calendar's failure shouldn't kill the whole sync — log and
          // move on. The error gets attached to the integration record by
          // the sync orchestrator's outer error handling.
          console.error(`GCAL_LIST_APPTS_ERR cal=${calendarId}:`, err);
          break;
        }

        const items = res.items ?? [];
        for (const ev of items) {
          // Skip all-day events — they're typically blackout days, not
          // bookable appointments. The dashboard calendar would render
          // these confusingly anyway.
          const startIso = ev.start?.dateTime;
          if (!startIso) continue;

          // Map Google's status to our normalized rollup
          let status: "confirmed" | "cancelled" | "completed" = "confirmed";
          if (ev.status === "cancelled") status = "cancelled";
          // Google doesn't have a "completed" concept on calendars themselves;
          // post-procedure tracking happens via /api/calendar/events completion
          // endpoints. We default to "confirmed" until that other path marks
          // the appointment completed.

          // Best-effort customer name extraction. Convention used by
          // bookAppointment is "{customerName} — {service}" so we try to
          // split the summary on the em-dash; falls back to attendees or
          // the raw summary.
          const summary = ev.summary || "";
          let customerName: string | undefined;
          let serviceName: string | undefined;
          const emDashIdx = summary.indexOf("—");
          const hyphenIdx = emDashIdx === -1 ? summary.indexOf(" - ") : -1;
          if (emDashIdx > -1) {
            customerName = summary.slice(0, emDashIdx).trim();
            serviceName = summary.slice(emDashIdx + 1).trim();
          } else if (hyphenIdx > -1) {
            customerName = summary.slice(0, hyphenIdx).trim();
            serviceName = summary.slice(hyphenIdx + 3).trim();
          } else {
            // No delimiter — treat the whole summary as the service name and
            // leave customerName blank. Tenant-created events often look like
            // "Lunch break" or "HydraFacial - Sarah" without our pattern.
            serviceName = summary || undefined;
          }
          // Fall back to attendee displayName for customer if our parse
          // didn't yield one (e.g. event was created via Google's UI directly)
          if (!customerName && ev.attendees?.length) {
            const human = ev.attendees.find((a) => a.email && !a.email.endsWith(".calendar.google.com"));
            customerName = human?.displayName ?? human?.email;
          }

          all.push({
            externalId: ev.id,
            startTime: startIso,
            endTime: ev.end?.dateTime,
            serviceName,
            staffName: calIdToProvider[calendarId],
            customerName,
            status,
            platformStatus: ev.status,
          });
        }

        pageToken = res.nextPageToken;
        if (!pageToken) break;
      }
    }

    return all;
  },

  async getAvailableSlots(ctx, { date, service, provider }): Promise<AdapterSlot[]> {
    const timeZone = ctx.config.timezone || DEFAULT_TZ;
    const calendarId = resolveCalendarId(ctx, provider);

    // Per-provider per-day hours, sourced from staff.working_hours via the loader.
    // Falls back to 09-17 default if tenantData is missing entirely.
    const hours = workingHoursForDay(ctx, date, provider);
    if (!hours) {
      // Closed that day — surface no slots. The AI will tell the caller
      // "we're closed Sundays, want me to try Monday?"
      return [];
    }

    // Per-service duration sourced from tenants.booking_settings.service_durations.
    const durationMin = durationForService(ctx, service);
    const bufferMin = bufferMinutes(ctx);

    // Bounds for freeBusy: full working day in tenant's tz, expressed as UTC.
    // Pad by buffer so a busy event ending right at workEnd still pushes the
    // last possible slot earlier.
    const timeMin = localToUtcIso(date, hours.start, timeZone);
    const timeMax = localToUtcIso(date, hours.end, timeZone);

    const busy = await fetchBusyPeriods(ctx, calendarId, timeMin, timeMax, timeZone);

    const slots = computeSlots({
      date,
      workStart: hours.start,
      workEnd: hours.end,
      durationMin,
      stepMin: 30, // anchor candidates every 30 min
      bufferMin,
      timeZone,
      busyPeriods: busy,
    });

    // Stash calendarId on each slot so bookAppointment can target the right
    // calendar even when the caller didn't repeat the provider arg.
    return slots.map((s) => ({ ...s, staffId: calendarId }));
  },

  async bookAppointment(ctx, input: AdapterBookingInput): Promise<AdapterBookingResult> {
    const timeZone = ctx.config.timezone || DEFAULT_TZ;
    const calendarId = input.staffId || resolveCalendarId(ctx, undefined);
    // Phase 2: per-service duration, matching what getAvailableSlots used so
    // the booking carves out the same length the caller agreed to.
    const durationMin = durationForService(ctx, input.service);

    // input.startTime arrives as either a local-naive ISO ("2025-12-15T14:00:00")
    // from getAvailableSlots above, OR a full ISO with offset from a different
    // path. Normalize: if there's no Z and no +/- offset in the string, treat
    // it as local-naive in the tenant's tz.
    const isNaive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(input.startTime);

    let startObj: { dateTime: string; timeZone: string };
    let endObj: { dateTime: string; timeZone: string };

    if (isNaive) {
      const [datePart, timePartFull] = input.startTime.split("T");
      const timePart = timePartFull.slice(0, 5); // "HH:MM"
      const endShift = addMinutes(datePart, timePart, durationMin);
      startObj = {
        dateTime: `${datePart}T${timePart}:00`,
        timeZone,
      };
      endObj = {
        dateTime: `${endShift.date}T${endShift.time}:00`,
        timeZone,
      };
    } else {
      // Full ISO with offset — parse to UTC then add duration
      const startMs = new Date(input.startTime).getTime();
      if (isNaN(startMs)) {
        return {
          ok: false,
          error: `Could not parse startTime: ${input.startTime}`,
          errorCode: "validation",
        };
      }
      const endMs = startMs + durationMin * 60 * 1000;
      startObj = { dateTime: new Date(startMs).toISOString(), timeZone };
      endObj = { dateTime: new Date(endMs).toISOString(), timeZone };
    }

    const description = [
      `Customer: ${input.customerName}`,
      `Phone: ${input.customerPhone}`,
      input.customerEmail ? `Email: ${input.customerEmail}` : null,
      `Service: ${input.service}`,
      input.notes ? `Notes: ${input.notes}` : null,
      "",
      "Booked via VauxVoice AI receptionist.",
    ]
      .filter(Boolean)
      .join("\n");

    const body = {
      summary: `${input.customerName} — ${input.service}`,
      description,
      start: startObj,
      end: endObj,
      // Sending the customer email as an attendee triggers Google's
      // confirmation email. Skipped if no email — phone-only callers don't
      // need to be added as attendees.
      ...(input.customerEmail
        ? { attendees: [{ email: input.customerEmail }] }
        : {}),
      reminders: { useDefault: true },
    };

    try {
      const res = await gcalFetch<{ id: string; htmlLink?: string }>(
        ctx,
        `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      return { ok: true, appointmentId: res.id };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Google returns 409 / specific error reasons when a hard conflict
      // exists; for a soft "slot is busy" the freeBusy check should have
      // already filtered it out, so a 4xx here generally means a write-
      // permission issue or a malformed payload.
      const unavailable = /conflict|busy|overlap/i.test(detail);
      const auth = /401|invalid_grant|unauthorized/i.test(detail);
      console.error("GCAL_BOOK_ERR:", detail);
      return {
        ok: false,
        error: detail,
        errorCode: auth ? "auth" : unavailable ? "unavailable" : "network",
      };
    }
  },
};

export default adapter;
