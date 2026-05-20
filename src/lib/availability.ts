import { supabaseAdmin } from "./supabase";
import { format, addMinutes, startOfDay, endOfDay, parseISO } from "date-fns";
import { loadTenantIntegration } from "./integrations";

// For CRM prospects in "prospect" status (i.e. demo outreach numbers — no
// real calendar integration, often no staff with working_hours configured),
// we synthesize plausible-looking slots so the AI sounds smooth instead of
// saying "we have nothing available". Spread across business hours, skips
// closed days, slightly varied so the demo doesn't sound robotic.
const DEMO_SLOT_OFFSETS_MIN = [30, 150, 270, 390, 480]; // ~30min, 2.5h, 4.5h, 6.5h, 8h after open
const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

interface BusinessHours {
  open?: string;
  close?: string;
}

function parseHHMM(hhmm: string): { h: number; m: number } | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}

// Safe fallback so a demo tenant whose business_hours were never set (or
// failed to normalize at activation time) still gets plausible-sounding
// slots. Without this, every call to the demo number ends in
// "no availability" — which makes the AI sound broken instead of selling.
// Exported so the prompt builder (buildBusinessHoursBlock) can use the
// same defaults — otherwise the AI's prompt and the slot tool drift
// (e.g. prompt says nothing about Sunday, tool says Sunday closed, AI
// hallucinates Sunday as next available).
export const DEFAULT_DEMO_HOURS: Record<string, BusinessHours | null> = {
  monday:    { open: "09:00", close: "18:00" },
  tuesday:   { open: "09:00", close: "18:00" },
  wednesday: { open: "09:00", close: "18:00" },
  thursday:  { open: "09:00", close: "18:00" },
  friday:    { open: "09:00", close: "18:00" },
  saturday:  { open: "10:00", close: "17:00" },
  sunday:    null,
};

// "Usable" means complete enough to trust as real configured data rather
// than partial research scraping. A prospect tenant whose business_hours
// shows only one day set (e.g. { sunday: { open, close } } and nothing
// else) used to slip through as "usable" — the prompt then rendered
// Mon-Sat as CLOSED and the AI offered Sunday as the next available day,
// which was wildly off for a clinic that's actually closed Sundays.
// Require at least 5 days configured (with open/close pair OR explicit
// null for closed) before we trust it; anything less falls back to the
// generic demo defaults.
export function hasUsableHours(
  tenantHours: Record<string, BusinessHours | string | null | undefined> | null | undefined
): boolean {
  if (!tenantHours) return false;
  const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
  const configured = days.filter((d) => {
    const v = tenantHours[d];
    if (v === null) return true; // explicitly closed
    if (typeof v === "string" && v.trim()) return true; // non-standard (e.g. "By appointment only") — still bookable
    return !!(v && typeof v === "object" && typeof (v as BusinessHours).open === "string" && typeof (v as BusinessHours).close === "string");
  });
  return configured.length >= 5;
}

function generateDemoSlots(
  tenantHours: Record<string, BusinessHours | string | null | undefined> | null | undefined,
  date: string
): { label: string; startTime: string }[] {
  const hours = hasUsableHours(tenantHours) ? tenantHours! : DEFAULT_DEMO_HOURS;
  const parsed = parseISO(date);
  if (Number.isNaN(parsed.getTime())) return [];
  const dayKey = DAY_KEYS[parsed.getDay()];
  const dayRaw = hours[dayKey];
  // Day is a free-text string ("By appointment only", "Half day", etc.)
  // — bookable but no regular range. Fall back to default hours so the
  // AI can still offer slots; it'll mention the appointment-only context
  // from the prompt's Clinic Hours block.
  const day = typeof dayRaw === "string"
    ? DEFAULT_DEMO_HOURS[dayKey] ?? null
    : (dayRaw as BusinessHours | null | undefined);
  if (!day?.open || !day?.close) return [];
  const open = parseHHMM(day.open);
  const close = parseHHMM(day.close);
  if (!open || !close) return [];
  const openTime = new Date(`${date}T${day.open}:00`);
  const closeTime = new Date(`${date}T${day.close}:00`);
  const totalMin = (closeTime.getTime() - openTime.getTime()) / 60_000;
  if (totalMin <= 60) return [];

  // If date is today, skip slot offsets that are already in the past.
  const now = new Date();
  const isToday = format(now, "yyyy-MM-dd") === date;

  const slots: { label: string; startTime: string }[] = [];
  for (const offset of DEMO_SLOT_OFFSETS_MIN) {
    if (offset >= totalMin - 30) continue; // keep at least 30 min before close
    const t = addMinutes(openTime, offset);
    if (isToday && t.getTime() < now.getTime() + 30 * 60_000) continue;
    slots.push({
      label: format(t, "h:mm a"),
      startTime: t.toISOString(),
    });
  }
  return slots;
}

/**
 * Cache of ISO startTimes returned by the platform adapter, keyed by
 * (tenantId, date, label). The AI reads back labels like "2:00 PM" to
 * the caller; when they pick one we need to recover the exact ISO to
 * pass into bookAppointment. Kept in-memory — fine for single-process,
 * will need a shared store if we scale horizontally for long calls.
 */
const slotCache = new Map<string, { label: string; startTime: string }[]>();
const cacheKey = (tenantId: string, date: string) => `${tenantId}|${date}`;

export function resolveCachedSlot(
  tenantId: string,
  date: string,
  label: string
): string | null {
  const arr = slotCache.get(cacheKey(tenantId, date));
  if (!arr) return null;
  const hit = arr.find((s) => s.label.toLowerCase() === label.toLowerCase());
  return hit?.startTime ?? null;
}

export async function getAvailableSlots(
  tenantId: string,
  date: string,
  service?: string,
  provider?: string
) {
  // Load the tenant's status + hours once. Status drives whether we should
  // synthesize demo slots when nothing real comes back (outreach prospects),
  // and hours drive both the demo generator and downstream sanity checks.
  const { data: tenantMeta } = await supabaseAdmin
    .from("tenants")
    .select("status, business_hours")
    .eq("id", tenantId)
    .maybeSingle();
  const isProspect = tenantMeta?.status === "prospect";

  // If the tenant is in direct_book mode and has a supported adapter,
  // defer to the platform. If the call fails we fall through to the
  // internal calendar-based availability so the AI never freezes.
  try {
    const integration = await loadTenantIntegration(tenantId);
    if (integration) {
      const slots = await integration.adapter.getAvailableSlots(integration.ctx, {
        date,
        service,
        provider,
      });
      slotCache.set(
        cacheKey(tenantId, date),
        slots.map((s) => ({ label: s.label, startTime: s.startTime }))
      );
      return slots.map((s) => s.label);
    }
  } catch (err) {
    console.error("DIRECT_BOOK_AVAILABILITY_ERR — falling back to internal:", err);
  }

  // Demo short-circuit for outreach prospects: no integration, no real
  // calendar — generate plausible slots from business_hours so the AI can
  // actually offer times instead of "we have nothing available". Runs only
  // for tenants in "prospect" status; real customers fall through to the
  // internal calendar below.
  if (isProspect) {
    const demoSlots = generateDemoSlots(
      tenantMeta?.business_hours as Record<string, BusinessHours | string | null | undefined> | null | undefined,
      date
    );
    if (demoSlots.length > 0) {
      slotCache.set(cacheKey(tenantId, date), demoSlots);
      return demoSlots.map((s) => s.label);
    }
    // Demo returned nothing (e.g. day is closed in business_hours) — fall
    // through to the empty array via internal path so the AI politely tells
    // the caller we're closed that day.
  }

  // 1. Fetch staff members
  const staffQuery = supabaseAdmin
    .from("staff")
    .select("*")
    .eq("tenant_id", tenantId);

  const { data: staffList } = await staffQuery;

  if (!staffList || staffList.length === 0) return [];

  // Filter staff by service if provided
  let capableStaff = service
    ? staffList.filter(s => s.services?.some((srv: string) => srv.toLowerCase().includes(service.toLowerCase())))
    : staffList;

  // Further filter by provider name if specified (partial, case-insensitive match
  // so "Dr. Sarah" matches a staff row named "Sarah Chen")
  if (provider && provider.trim() && !/no preference|any|anyone/i.test(provider)) {
    const needle = provider.toLowerCase().replace(/dr\.?\s*/g, "").trim();
    const matched = capableStaff.filter(s =>
      (s.name || "").toLowerCase().includes(needle) ||
      needle.split(/\s+/).some(part => part.length > 2 && (s.name || "").toLowerCase().includes(part))
    );
    // If the requested provider doesn't match anyone capable of the service,
    // return empty so the AI knows to clarify rather than silently showing
    // another staffer's slots.
    if (matched.length === 0) return [];
    capableStaff = matched;
  }

  if (capableStaff.length === 0) return [];

  // 2. Fetch existing appointments for the day
  const dayStart = startOfDay(parseISO(date)).toISOString();
  const dayEnd = endOfDay(parseISO(date)).toISOString();

  const { data: existingEvents } = await supabaseAdmin
    .from("calendar_events")
    .select("start_time, end_time, staff_id")
    .eq("tenant_id", tenantId)
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd);

  // 3. Generate combined slots
  const allAvailableSlots = new Set<string>();
  const dayOfWeek = format(parseISO(date), "eeee").toLowerCase();

  for (const staff of capableStaff) {
    const hours = staff.working_hours?.[dayOfWeek];
    if (!hours) continue;

    let currentPos = new Date(`${date}T${hours.open}:00`);
    const endPos = new Date(`${date}T${hours.close}:00`);

    while (currentPos < endPos) {
      // Check if THIS specific staff is busy
      const isBusy = existingEvents?.some(evt => {
        if (evt.staff_id !== staff.id) return false;
        
        const evtStart = new Date(evt.start_time).getTime();
        const evtEnd = new Date(evt.end_time).getTime();
        const sStart = currentPos.getTime();
        const sEnd = sStart + 60 * 60 * 1000;
        
        return (sStart < evtEnd && sEnd > evtStart);
      });

      if (!isBusy) {
        allAvailableSlots.add(format(currentPos, "h:mm a"));
      }
      
      currentPos = addMinutes(currentPos, 60);
    }
  }

  return Array.from(allAvailableSlots).sort((a, b) => {
    return new Date(`${date} ${a}`).getTime() - new Date(`${date} ${b}`).getTime();
  });
}
