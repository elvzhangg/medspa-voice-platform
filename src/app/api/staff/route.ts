import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("staff")
    .select(
      "id, name, title, bio, services, specialties, ai_notes, working_hours, active, external_source, external_id, last_synced_at"
    )
    .eq("tenant_id", (tenant as any).id)
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  return NextResponse.json({ staff: data ?? [] });
}

export async function POST(req: Request) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, title, services, specialties, ai_notes } = body;

  // Tenant-created rows are always internal (no external_source). Platform
  // rows only ever appear via provider-sync — never via this endpoint.
  const { data, error } = await supabaseAdmin
    .from("staff")
    .insert({
      tenant_id: (tenant as any).id,
      name,
      title: title ?? null,
      services: Array.isArray(services) ? services : [],
      specialties: Array.isArray(specialties) ? specialties : [],
      ai_notes: ai_notes ?? null,
      active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  return NextResponse.json({ staff: data });
}
