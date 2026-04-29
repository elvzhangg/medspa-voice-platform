import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("client_profiles")
    .select(
      // The trailing platform_* / favorite_* / last_purchase_at /
      // total_sales_cents fields are populated by the booking-platform
      // sync (Phase 2). Surfacing them in the list view so clients who
      // book through Mindbody but never call the AI still show
      // meaningful activity rather than a row of zeros.
      "id, phone, first_name, last_name, email, total_calls, total_bookings, last_call_at, last_booking_at, last_service, last_provider, preferred_provider, preferred_time, referral_source, tags, staff_notes, no_personalization, created_at, updated_at, platform_visit_count, platform_last_visit_at, favorite_service, favorite_staff, last_purchase_at, total_sales_cents"
    )
    .eq("tenant_id", tenant.id)
    // Sort by whichever recency signal we have — falls back from Vaux
    // call to platform visit so synced-but-never-called clients still
    // sort sensibly. nulls last so unknown-recency rows go to the bottom.
    .order("last_call_at", { ascending: false, nullsFirst: false })
    .order("platform_last_visit_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    console.error("CLIENTS_FETCH_ERROR:", error);
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  }

  return NextResponse.json({ clients: data ?? [] });
}
