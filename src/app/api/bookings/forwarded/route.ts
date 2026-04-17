import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("booking_requests")
    .select(
      "id, customer_name, customer_phone, service, preferred_date, preferred_time, notes, backup_slots, time_preference, provider_preference, status, forwarded_to, forward_sent_at, created_at"
    )
    .eq("tenant_id", tenant.id)
    .not("forward_sent_at", "is", null)
    .order("forward_sent_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("FORWARDED_BOOKINGS_FETCH_ERROR:", error);
    return NextResponse.json({ error: "Failed to load forwarded requests" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
