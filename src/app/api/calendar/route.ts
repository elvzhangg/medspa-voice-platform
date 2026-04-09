import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";

export async function GET() {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("start_time", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(req: Request) {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, start_time, end_time, customer_name, customer_phone, service_type } = body;

  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .insert({
      tenant_id: tenant.id,
      title,
      start_time,
      end_time,
      customer_name,
      customer_phone,
      service_type,
      status: "confirmed"
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  return NextResponse.json({ event: data });
}
