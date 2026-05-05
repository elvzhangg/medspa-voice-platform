import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureFreshAccessToken } from "@/lib/google-oauth";

/**
 * GET /api/integrations/debug-events
 *
 * Tenant-side debug endpoint that shows EXACTLY what Google Calendar's
 * events.list returns for the configured calendar, so we can see why an
 * event might or might not be appearing in the dashboard.
 *
 * Returns the raw API response (truncated to relevant fields) without
 * the parsing/filtering my listAppointments adapter does. Useful for
 * answering questions like:
 *   - Is the event even on the calendar VauxVoice queries?
 *   - Is it inside the sync window?
 *   - Is it all-day vs timed?
 *   - What's its raw status (cancelled, tentative, etc.)?
 *
 * Calls Google directly with a 30-day-back/90-day-forward window. Lists
 * all events including cancellations and recurring expansions.
 */
export async function GET() {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (tenant as unknown as { id: string }).id;

  // Resolve config (timezone, calendar IDs)
  const { data: integ } = await supabaseAdmin
    .from("tenant_integrations")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("platform", "google_calendar")
    .maybeSingle();

  const config = (integ?.config ?? {}) as Record<string, string | undefined>;
  const defaultCalId = config.default_calendar_id || "primary";

  // Provider calendars JSON
  let providerCals: Record<string, string> = {};
  if (config.provider_calendars) {
    try {
      const parsed = JSON.parse(config.provider_calendars);
      if (parsed && typeof parsed === "object") {
        providerCals = parsed as Record<string, string>;
      }
    } catch {
      // ignore
    }
  }
  const calendarIdsToQuery: string[] =
    Object.values(providerCals).filter(Boolean).length > 0
      ? Array.from(new Set(Object.values(providerCals)))
      : [defaultCalId];

  // Get a fresh access token
  let accessToken: string;
  try {
    accessToken = await ensureFreshAccessToken(tenantId);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "No valid OAuth tokens — reconnect Google.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }

  // Window: -30 days to +90 days, matching what runFullTenantSync uses
  // (-90 / +90). Tighter back-window for debug since most stale events
  // people care about are recent.
  const nowMs = Date.now();
  const timeMin = new Date(nowMs - 30 * 86_400_000).toISOString();
  const timeMax = new Date(nowMs + 90 * 86_400_000).toISOString();

  // 1) Confirm we can list calendars at all
  let calendarList: unknown = null;
  try {
    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    calendarList = await calRes.json();
  } catch (err) {
    calendarList = { error: err instanceof Error ? err.message : String(err) };
  }

  // 2) For each configured calendar, fetch raw events
  const calendarResults: Array<{
    calendarId: string;
    httpStatus: number;
    eventCount: number;
    sampleEvents: Array<{
      id: string;
      summary?: string;
      status?: string;
      start?: unknown;
      end?: unknown;
      isAllDay: boolean;
    }>;
    error?: string;
  }> = [];

  for (const calId of calendarIdsToQuery) {
    try {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "100",
        showDeleted: "true",
      });
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calId
      )}/events?${params}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = (await res.json()) as {
        items?: Array<{
          id: string;
          summary?: string;
          status?: string;
          start?: { dateTime?: string; date?: string };
          end?: { dateTime?: string; date?: string };
        }>;
        error?: { message?: string };
      };

      if (!res.ok) {
        calendarResults.push({
          calendarId: calId,
          httpStatus: res.status,
          eventCount: 0,
          sampleEvents: [],
          error: body?.error?.message ?? "Unknown error",
        });
        continue;
      }

      const items = body.items ?? [];
      // Show up to first 20 events, with the all-day flag exposed clearly
      const sample = items.slice(0, 20).map((ev) => ({
        id: ev.id,
        summary: ev.summary,
        status: ev.status,
        start: ev.start,
        end: ev.end,
        // If start.dateTime is missing (only start.date), it's an all-day event
        isAllDay: !ev.start?.dateTime,
      }));
      calendarResults.push({
        calendarId: calId,
        httpStatus: 200,
        eventCount: items.length,
        sampleEvents: sample,
      });
    } catch (err) {
      calendarResults.push({
        calendarId: calId,
        httpStatus: 0,
        eventCount: 0,
        sampleEvents: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3) Also peek into our own calendar_events table to see what got
  //    persisted from prior syncs. Same time window as the API query
  //    so we can compare side-by-side.
  const { data: storedEvents } = await supabaseAdmin
    .from("calendar_events")
    .select(
      "id, title, start_time, end_time, status, external_source, external_id, customer_name, service_type, last_synced_at"
    )
    .eq("tenant_id", tenantId)
    .gte("start_time", timeMin)
    .lt("start_time", timeMax)
    .order("start_time", { ascending: true });

  return NextResponse.json({
    config: {
      default_calendar_id: defaultCalId,
      provider_calendars: providerCals,
      timezone: config.timezone ?? null,
    },
    syncWindow: { timeMin, timeMax },
    calendarsQueried: calendarIdsToQuery,
    calendarList, // raw response so we can see ALL calendars the user has
    eventResults: calendarResults,
    // Peek at our own DB so we can see whether events from the API
    // actually made it through the upsert path.
    storedEvents: {
      count: storedEvents?.length ?? 0,
      rows: storedEvents ?? [],
    },
  });
}
