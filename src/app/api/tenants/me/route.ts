import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const tenant = await getCurrentTenant() as {
    id: string;
    name: string;
    phone_number: string;
    slug: string;
  } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ tenant });
}

export async function PATCH(req: NextRequest) {
  const tenant = await getCurrentTenant() as { id: string; name: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const trimmedName = name.trim();
  const newSlug = trimmedName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  const { data: updated, error } = await supabaseAdmin
    .from("tenants")
    .update({
      name: trimmedName,
      slug: newSlug,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenant.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update: " + error.message }, { status: 500 });
  }

  return NextResponse.json({ tenant: updated });
}
