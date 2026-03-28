import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data: tenants, error: tenantsError } = await supabaseAdmin
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: false });

  if (tenantsError) {
    return NextResponse.json({ error: "Failed to fetch tenants" }, { status: 500 });
  }

  return NextResponse.json({ tenants: tenants ?? [] });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, name, phone_number } = body as { id: string; name?: string; phone_number?: string };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (phone_number !== undefined) updates.phone_number = phone_number;

  const { data, error } = await supabaseAdmin
    .from("tenants")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update tenant" }, { status: 500 });
  }

  return NextResponse.json({ tenant: data });
}
