import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

const ALLOWED = [
  "name",
  "description",
  "category",
  "duration_min",
  "price_display",
  "price_cents",
  "active",
  "display_order",
] as const;

// PATCH /api/services/[id] — partial update, tenant-scoped.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key];
  }
  // String fields: "" → null so empty saves don't pollute filters/listings.
  for (const key of ["description", "category", "price_display"] as const) {
    if (key in updates && typeof updates[key] === "string" && (updates[key] as string).trim() === "") {
      updates[key] = null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("tenant_services")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", (tenant as any).id)
    .select()
    .single();

  if (error) {
    console.error("[services] patch failed", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ service: data });
}

// DELETE /api/services/[id] — hard delete, tenant-scoped.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const { error } = await supabaseAdmin
    .from("tenant_services")
    .delete()
    .eq("id", id)
    .eq("tenant_id", (tenant as any).id);

  if (error) {
    console.error("[services] delete failed", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
