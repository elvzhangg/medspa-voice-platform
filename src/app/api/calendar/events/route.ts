import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Returns the tenant's calendar_events for a date window.
 *
 * Data comes from three sources, all unified in one table:
 *   1. AI-booked events    (external_source IS NULL)
 *   2. Platform webhooks   (external_source = 'boulevard' | 'acuity' | …)
 *   3. Manual entries      (future — dashboard or admin-created)
 *
 * Query: GET /api/calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD
 */
export async function GET(req: NextRequest) {
  const tenant = (await getCurrentTenant()) as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  // Default to the current month if no range given
  const now = new Date();
  const start = startParam
    ? new Date(startParam)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = endParam
    ? new Date(endParam)
    : new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .select(
      "id, title, description, start_time, end_time, customer_name, customer_phone, service_type, status, external_source, external_id, last_synced_at, completed_at"
    )
    .eq("tenant_id", tenant.id)
    .gte("start_time", start.toISOString())
    .lt("start_time", end.toISOString())
    .order("start_time", { ascending: true });

  if (error) {
    console.error("CALENDAR_EVENTS_FETCH_ERROR:", error);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
