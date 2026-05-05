import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Tenant-facing scheduling settings: service durations + buffer time.
 *
 * GET   /api/scheduling   -> returns tenants.booking_settings
 * PATCH /api/scheduling   -> upserts booking_settings; merges with existing
 *
 * Working hours are NOT managed here — those live per-staff at /api/staff
 * (since each provider can work different hours). This endpoint only
 * handles tenant-level scheduling defaults.
 */

interface BookingSettings {
  service_durations: Record<string, number>;
  buffer_min: number;
}

const DEFAULT_SETTINGS: BookingSettings = {
  service_durations: { default: 60 },
  buffer_min: 0,
};

export async function GET() {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("booking_settings")
    .eq("id", (tenant as unknown as { id: string }).id)
    .maybeSingle();

  if (error) {
    console.error("SCHEDULING_GET_ERR:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }

  // Defend against null / partial settings — older tenants pre-migration
  // backfill, or hand-edited rows. Fill in defaults for any missing piece.
  const raw = (data?.booking_settings ?? {}) as Partial<BookingSettings>;
  const settings: BookingSettings = {
    service_durations:
      raw.service_durations && typeof raw.service_durations === "object"
        ? raw.service_durations
        : DEFAULT_SETTINGS.service_durations,
    buffer_min:
      typeof raw.buffer_min === "number" && raw.buffer_min >= 0
        ? raw.buffer_min
        : DEFAULT_SETTINGS.buffer_min,
  };

  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Partial<BookingSettings>;

  // Validate the shape before writing — bad input would silently corrupt the
  // GCal adapter's slot computation. Service duration values must be positive
  // integers; buffer must be a non-negative integer.
  const sanitized: Partial<BookingSettings> = {};

  if (body.service_durations !== undefined) {
    if (typeof body.service_durations !== "object" || body.service_durations === null) {
      return NextResponse.json(
        { error: "service_durations must be an object mapping service name -> minutes" },
        { status: 400 }
      );
    }
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.service_durations)) {
      const n = typeof v === "number" ? v : parseInt(String(v), 10);
      if (!isNaN(n) && n > 0 && n <= 480) {
        // 8 hours is a sane upper bound for a single appointment
        cleaned[k.trim()] = n;
      }
    }
    if (cleaned["default"] === undefined) {
      // Always have a default so the GCal adapter doesn't fall through to its
      // 60-min hardcoded fallback unintentionally
      cleaned["default"] = 60;
    }
    sanitized.service_durations = cleaned;
  }

  if (body.buffer_min !== undefined) {
    const n = typeof body.buffer_min === "number" ? body.buffer_min : parseInt(String(body.buffer_min), 10);
    if (isNaN(n) || n < 0 || n > 120) {
      return NextResponse.json(
        { error: "buffer_min must be an integer between 0 and 120" },
        { status: 400 }
      );
    }
    sanitized.buffer_min = n;
  }

  // Merge with existing settings rather than overwriting — partial PATCH
  // shouldn't blow away fields the caller didn't touch.
  const { data: existingRow } = await supabaseAdmin
    .from("tenants")
    .select("booking_settings")
    .eq("id", (tenant as unknown as { id: string }).id)
    .maybeSingle();

  const existing = (existingRow?.booking_settings ?? DEFAULT_SETTINGS) as BookingSettings;
  const merged: BookingSettings = {
    service_durations: sanitized.service_durations ?? existing.service_durations,
    buffer_min: sanitized.buffer_min ?? existing.buffer_min,
  };

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({ booking_settings: merged })
    .eq("id", (tenant as unknown as { id: string }).id);

  if (error) {
    console.error("SCHEDULING_PATCH_ERR:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, settings: merged });
}
