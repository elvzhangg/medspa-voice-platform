import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ valid: false, error: "No invite code provided" });
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, name")
    .eq("invite_code", code)
    .maybeSingle();

  if (!tenant) {
    return NextResponse.json({ valid: false, error: "Invalid invite code" });
  }

  return NextResponse.json({
    valid: true,
    tenant_id: tenant.id,
    tenant_name: tenant.name,
  });
}
