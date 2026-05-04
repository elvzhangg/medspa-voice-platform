/**
 * Per-platform display tokens shared across dashboard pages.
 *
 * Used by:
 *   - Calendar event tiles + legend (color + label)
 *   - SyncStatusBar pill (label only, color comes from the green pulse)
 *   - Future: Providers / Clients badges if we ever surface external_source there
 *
 * Keep this map in sync with the platform list in
 * src/app/api/admin/tenants/[id]/integration/route.ts.
 */
export const PLATFORM_COLORS: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  boulevard: { bg: "bg-rose-100", text: "text-rose-800", label: "Boulevard" },
  acuity: { bg: "bg-gray-900", text: "text-white", label: "Acuity" },
  mindbody: { bg: "bg-sky-100", text: "text-sky-800", label: "Mindbody" },
  square: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Square" },
  zenoti: { bg: "bg-amber-100", text: "text-amber-800", label: "Zenoti" },
  vagaro: { bg: "bg-orange-100", text: "text-orange-800", label: "Vagaro" },
  jane: { bg: "bg-teal-100", text: "text-teal-800", label: "Jane" },
  wellnessliving: { bg: "bg-lime-100", text: "text-lime-800", label: "WellnessLiving" },
  google_calendar: { bg: "bg-blue-100", text: "text-blue-800", label: "Google Calendar" },
};
