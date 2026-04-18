import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("client_profiles")
    .select(
      "id, phone, first_name, last_name, email, total_calls, total_bookings, last_call_at, last_booking_at, last_service, last_provider, preferred_provider, preferred_time, referral_source, tags, staff_notes, no_personalization, created_at, updated_at"
    )
    .eq("tenant_id", tenant.id)
    .order("last_call_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    console.error("CLIENTS_FETCH_ERROR:", error);
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  }

  return NextResponse.json({ clients: data ?? [] });
}
