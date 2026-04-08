import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { invite_code, user_id } = await req.json();

  if (!invite_code || !user_id) {
    return NextResponse.json({ error: "Missing invite_code or user_id" }, { status: 400 });
  }

  // Find tenant by invite code
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("invite_code", invite_code)
    .maybeSingle();

  if (!tenant) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  // Link user to tenant (check for duplicates)
  const { data: existing } = await supabaseAdmin
    .from("tenant_users")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true }); // Already linked
  }

  // Create the link
  const { error } = await supabaseAdmin.from("tenant_users").insert({
    tenant_id: tenant.id,
    user_id: user_id,
    role: "owner",
  });

  if (error) {
    console.error("Failed to link user to tenant:", error);
    return NextResponse.json({ error: "Failed to link account" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
