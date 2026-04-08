import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  // 1. Check auth
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse input
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, city, state } = body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Business name is required" }, { status: 400 });
  }

  // 3. Check if user already has a tenant — if so, just redirect
  const { data: existingTenantUser } = await supabaseAdmin
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (existingTenantUser) {
    return NextResponse.json({ success: true });
  }

  // 4. Generate a unique slug (handle duplicates by appending random suffix)
  const baseSlug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  let slug = baseSlug;
  let slugAttempt = 0;
  
  while (true) {
    const { data: existingSlug } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!existingSlug) break; // Slug is available

    slugAttempt++;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    
    if (slugAttempt > 5) {
      // Fallback: use timestamp
      slug = `${baseSlug}-${Date.now()}`;
      break;
    }
  }

  // 5. Build display name
  const nameParts = [name.trim()];
  if (city?.trim()) nameParts.push(city.trim());
  if (state?.trim()) nameParts.push(state.trim());
  const displayName = nameParts.join(", ");

  // 6. Generate unique placeholder phone number
  const placeholderPhone = `pending-${session.user.id.slice(0, 8)}-${Date.now()}`;

  // 7. Create the tenant
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .insert({
      name: displayName,
      slug,
      phone_number: placeholderPhone,
    })
    .select()
    .single();

  if (tenantError) {
    console.error("Failed to create tenant:", tenantError);
    return NextResponse.json(
      { error: "Something went wrong creating your account. Please try again." },
      { status: 500 }
    );
  }

  // 8. Link user to tenant
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
      { error: "Something went wrong setting up your account. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
