import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("referrals")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to fetch referrals" }, { status: 500 });
  return NextResponse.json({ referrals: data });
}

export async function POST(req: NextRequest) {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { referred_by_name, referred_by_phone, new_patient_name, new_patient_phone, source, notes } = body;

  if (!referred_by_name && !new_patient_name) {
    return NextResponse.json({ error: "At least one name is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("referrals")
    .insert({
      tenant_id: tenant.id,
      referred_by_name: referred_by_name || null,
      referred_by_phone: referred_by_phone || null,
      new_patient_name: new_patient_name || null,
      new_patient_phone: new_patient_phone || null,
      source: source || "manual",
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to create referral" }, { status: 500 });
  return NextResponse.json({ referral: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });

  // Verify ownership
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("referrals")
    .select("id, tenant_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenant_id !== tenant.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabaseAdmin
    .from("referrals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  // Verify ownership
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("referrals")
    .select("id, tenant_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenant_id !== tenant.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabaseAdmin.from("referrals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  return NextResponse.json({ success: true });
}
