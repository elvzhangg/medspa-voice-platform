import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, city, state } = await req.json();
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Business name is required" }, { status: 400 });
  }

  // Check if user already has a tenant
  const { data: existingTenantUser } = await supabaseAdmin
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (existingTenantUser) {
    // Already onboarded — just redirect
    return NextResponse.json({ success: true });
  }

  // Generate slug from business name
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  // Build display name with city/state if provided
  const displayName = [name.trim(), city?.trim(), state?.trim()]
    .filter(Boolean)
    .join(", ")
    .replace(/,\s*$/, "");

  // phone_number is NOT NULL UNIQUE in the schema — use a placeholder until assigned
  const placeholderPhone = `pending-${session.user.id}`;

  // Create the tenant
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .insert({
      name: displayName,
      slug,
      phone_number: placeholderPhone,
      owner_user_id: session.user.id,
    })
    .select()
    .single();

  if (tenantError) {
    console.error("Failed to create tenant:", tenantError);
    return NextResponse.json(
      { error: "Failed to create tenant: " + tenantError.message },
      { status: 500 }
    );
  }

  // Create tenant_users record
  const { error: tuError } = await supabaseAdmin.from("tenant_users").insert({
    tenant_id: tenant.id,
    user_id: session.user.id,
    role: "owner",
  });

  if (tuError) {
    console.error("Failed to create tenant_user:", tuError);
    // Rollback the tenant
    await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
    return NextResponse.json(
      { error: "Failed to set up user: " + tuError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
