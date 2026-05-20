// Normalizes the loose business_hours JSONB stored on crm_prospects (which the
// research agent fills in any shape — strings, partial objects, "Closed"
// markers) into the strict { open: "HH:MM", close: "HH:MM" } per-day shape
// that tenants.business_hours + assistant-builder.buildBusinessHoursBlock
// expects. Anything we can't confidently parse becomes null for that day.

// DayHours includes a string form for non-standard arrangements that don't
// fit a 9-to-5 range — "By appointment only", "Walk-ins 10-12 only", etc.
// These are bookable days that need to be preserved verbatim for the AI
// prompt rather than coerced into either {open,close} or "closed".
export type DayHours = { open: string; close: string } | string | null;
export type NormalizedHours = Partial<Record<
  "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday",
  DayHours
>>;

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const ABBREV_TO_DAY: Record<string, typeof DAYS[number]> = {
  mon: "monday", monday: "monday",
  tue: "tuesday", tues: "tuesday", tuesday: "tuesday",
  wed: "wednesday", weds: "wednesday", wednesday: "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday",
  fri: "friday", friday: "friday",
  sat: "saturday", saturday: "saturday",
  sun: "sunday", sunday: "sunday",
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Parses one time token like "9", "9am", "9:30", "9:30 am", "21:00", "9 PM"
// into "HH:MM" 24h. Returns null if it can't make sense of it.
function parseTimeToken(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\./g, "");
  if (!s) return null;
  // Match: optional digits-h, optional :mm, optional am/pm
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3] ? m[3][0] : null;
  if (h < 0 || h > 24 || mm < 0 || mm > 59) return null;
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  // Bare "9" with no am/pm is ambiguous — treat 1-7 as PM (most spas open
  // late morning; "8" or "9" as AM is the common case). This is a heuristic
  // for messy data; if the user wants to override they can chat.
  if (!ap && h >= 1 && h <= 7) h += 12;
  if (h === 24) h = 0;
  return `${pad2(h)}:${pad2(mm)}`;
}

// Parses a free-form hours string like "9 AM - 6 PM", "9:00-18:00", "Closed",
// "9-6", "10 a.m. – 7 p.m." into {open, close}. Handles the unicode dash
// variants and various separators.
function parseHoursString(raw: string): DayHours {
  const s = raw.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "closed" || lower === "off" || lower.includes("closed")) return null;
  if (lower === "24 hours" || lower === "24/7" || lower.includes("24 hour")) {
    return { open: "00:00", close: "23:59" };
  }
  // Split on any dash / "to" separator. en-dash, em-dash, hyphen, "to".
  const parts = s.split(/\s*[-–—]\s*|\s+to\s+/i);
  if (parts.length === 2) {
    const open = parseTimeToken(parts[0]);
    const close = parseTimeToken(parts[1]);
    if (open && close) return { open, close };
  }
  // Couldn't parse as a range and not "closed" — preserve as a free-text
  // hours note (e.g. "By appointment only", "Half day", "Walk-ins only").
  // The AI prompt renders these verbatim so callers get accurate context.
  return s;
}

function normalizeDayValue(value: unknown): DayHours {
  if (value == null) return null;
  if (typeof value === "string") return parseHoursString(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const open = typeof obj.open === "string" ? parseTimeToken(obj.open) : null;
    const close = typeof obj.close === "string" ? parseTimeToken(obj.close) : null;
    if (open && close) return { open, close };
    // Sometimes the model returns { hours: "9-6" } or { display: "..." } —
    // recurse on whatever string-like field exists.
    for (const v of Object.values(obj)) {
      if (typeof v === "string") {
        const parsed = parseHoursString(v);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

/**
 * Best-effort normalization. Accepts:
 *   - { monday: { open, close }, ... }
 *   - { monday: "9 AM - 6 PM", tuesday: "Closed", ... }
 *   - { Mon: "9-6", Tues: "9-6", ... }
 *   - mixed forms
 * Returns a clean { day: { open, close } | null } shape, or null if input
 * is fundamentally unusable.
 */
export function normalizeBusinessHours(input: unknown): NormalizedHours | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const out: NormalizedHours = {};
  let any = false;
  for (const [key, value] of Object.entries(obj)) {
    const dayKey = ABBREV_TO_DAY[key.trim().toLowerCase()];
    if (!dayKey) continue;
    const parsed = normalizeDayValue(value);
    // Accept any non-undefined result — null means "explicitly closed",
    // a string means "non-standard but bookable", an object is regular hours.
    if (parsed !== undefined) {
      out[dayKey] = parsed;
      any = true;
    }
  }
  return any ? out : null;
}
