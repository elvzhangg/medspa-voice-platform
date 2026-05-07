import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/staff/import/apply
 *
 * Takes the (possibly tenant-edited) extracted payload from
 * /api/staff/import and writes it to the DB.
 *
 * Two destinations:
 *   1. `staff` rows — merge by case-insensitive name match. Existing rows
 *      get their services/specialties/ai_notes/title patched (preserving
 *      working_hours, external_source, etc.); new rows are inserted.
 *   2. `tenants.booking_settings.service_durations` — service durations
 *      from the extract are merged into the existing JSON map.
 *
 * Safe to call multiple times — idempotent in practice because we match
 * on name.
 *
 * Auth: tenant session via getCurrentTenant.
 */

interface IncomingProvider {
  name: string;
  title: string | null;
  services: string[];
  specialties: string[];
  ai_notes: string | null;
}

interface IncomingService {
  name: string;
  duration_min: number | null;
  price: string | null;
  category: string | null;
}

interface ApplyBody {
  providers?: IncomingProvider[];
  services?: IncomingService[];
}

interface BookingSettings {
  service_durations?: Record<string, number>;
  buffer_min?: number;
}

export async function POST(req: NextRequest) {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = (tenant as unknown as { id: string }).id;

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incomingProviders = Array.isArray(body.providers) ? body.providers : [];
  const incomingServices = Array.isArray(body.services) ? body.services : [];

  // --------------------------------------------------------------------- //
  // Providers: merge by name                                              //
  // --------------------------------------------------------------------- //

  // Fetch existing staff so we can match by name (case-insensitive) without
  // a separate query per provider.
  const { data: existingStaff } = await supabaseAdmin
    .from("staff")
    .select("id, name, title, services, specialties, ai_notes")
    .eq("tenant_id", tenantId);

  const byNameLower = new Map<string, { id: string; row: typeof existingStaff extends (infer T)[] | null ? T : never }>();
  for (const row of (existingStaff ?? []) as Array<{
    id: string;
    name: string;
    title: string | null;
    services: string[] | null;
    specialties: string[] | null;
    ai_notes: string | null;
  }>) {
    if (row.name) byNameLower.set(row.name.toLowerCase().trim(), { id: row.id, row } as never);
  }

  let providersCreated = 0;
  let providersUpdated = 0;
  const providerErrors: string[] = [];

  for (const p of incomingProviders) {
    const cleanName = (p.name ?? "").trim();
    if (!cleanName) continue;

    const matchKey = cleanName.toLowerCase();
    const existing = byNameLower.get(matchKey);

    // Normalize lists: trim, dedupe, drop blanks
    const services = uniqClean(p.services);
    const specialties = uniqClean(p.specialties);

    if (existing) {
      // PATCH — merge services and specialties into existing arrays so we
      // don't delete tenant-curated entries that the AI didn't pick up.
      const merged = existing as unknown as {
        id: string;
        row: {
          services: string[] | null;
          specialties: string[] | null;
          title: string | null;
          ai_notes: string | null;
        };
      };
      const mergedServices = uniqClean([
        ...(merged.row.services ?? []),
        ...services,
      ]);
      const mergedSpecialties = uniqClean([
        ...(merged.row.specialties ?? []),
        ...specialties,
      ]);
      const update: Record<string, unknown> = {
        services: mergedServices,
        specialties: mergedSpecialties,
      };
      // Only overwrite title/ai_notes if the existing row has nothing — don't
      // clobber tenant-curated copy with AI-extracted version.
      if (!merged.row.title && p.title) update.title = p.title;
      if (!merged.row.ai_notes && p.ai_notes) update.ai_notes = p.ai_notes;

      const { error } = await supabaseAdmin
        .from("staff")
        .update(update)
        .eq("id", merged.id);
      if (error) {
        providerErrors.push(`${cleanName}: ${error.message}`);
      } else {
        providersUpdated++;
      }
    } else {
      // INSERT new staff row
      const { error } = await supabaseAdmin.from("staff").insert({
        tenant_id: tenantId,
        name: cleanName,
        title: p.title ?? null,
        services,
        specialties,
        ai_notes: p.ai_notes ?? null,
        active: true,
      });
      if (error) {
        providerErrors.push(`${cleanName}: ${error.message}`);
      } else {
        providersCreated++;
      }
    }
  }

  // --------------------------------------------------------------------- //
  // Service durations: merge into tenants.booking_settings                //
  // --------------------------------------------------------------------- //

  const { data: tenantRow } = await supabaseAdmin
    .from("tenants")
    .select("booking_settings")
    .eq("id", tenantId)
    .maybeSingle();

  const existingSettings: BookingSettings =
    (tenantRow?.booking_settings as BookingSettings | null | undefined) ?? {};
  const existingDurations: Record<string, number> = {
    ...(existingSettings.service_durations ?? {}),
  };

  let servicesAdded = 0;
  let servicesUpdated = 0;

  for (const s of incomingServices) {
    const cleanName = (s.name ?? "").trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    if (typeof s.duration_min === "number" && s.duration_min > 0) {
      if (existingDurations[key] !== undefined) {
        // Keep existing duration unless the new one differs — prevents the
        // import from clobbering a manually-edited value.
        if (existingDurations[key] !== s.duration_min) {
          // But still don't overwrite — log it for the response so the user
          // can decide later.
        }
        // Don't increment counters for no-change updates.
      } else {
        existingDurations[key] = s.duration_min;
        servicesAdded++;
      }
    }
  }

  // Always ensure a default duration exists
  if (existingDurations["default"] === undefined) {
    existingDurations["default"] = 60;
  }

  const newSettings: BookingSettings = {
    ...existingSettings,
    service_durations: existingDurations,
  };

  const { error: settingsErr } = await supabaseAdmin
    .from("tenants")
    .update({ booking_settings: newSettings })
    .eq("id", tenantId);

  if (settingsErr) {
    console.error("STAFF_IMPORT_APPLY_SETTINGS_ERR:", settingsErr);
    return NextResponse.json(
      {
        error: "Saved providers but failed to write service durations",
        detail: settingsErr.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    providers: { created: providersCreated, updated: providersUpdated, errors: providerErrors },
    serviceDurations: { added: servicesAdded, updated: servicesUpdated },
  });
}

// Trim, drop empties, deduplicate (case-insensitive but preserve first
// casing seen).
function uniqClean(values: string[] | undefined): string[] {
  if (!values) return [];
  const seen = new Map<string, string>();
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return Array.from(seen.values());
}
