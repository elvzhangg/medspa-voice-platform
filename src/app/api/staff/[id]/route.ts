import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH — update a staff row.
 *
 * Tenants can edit every field; platform-sourced fields (name, title,
 * services, working_hours) on synced rows will be overwritten on the
 * next sync cycle, so the UI disables those inputs for clarity. The
 * tenant-authored fields (ai_notes, specialties, active) are always safe.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.title !== undefined) update.title = body.title;
  if (body.services !== undefined) update.services = Array.isArray(body.services) ? body.services : [];
  if (body.specialties !== undefined)
    update.specialties = Array.isArray(body.specialties) ? body.specialties : [];
  if (body.ai_notes !== undefined) update.ai_notes = body.ai_notes;
  if (body.active !== undefined) update.active = Boolean(body.active);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("staff")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", (tenant as any).id);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ success: true });
}

/**
 * DELETE — only allowed on tenant-created (internal) rows. Platform-synced
 * rows can't be hard-deleted because the next sync would just re-insert
 * them; use the active=false toggle via PATCH to hide them instead.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from("staff")
    .select("external_source")
    .eq("id", id)
    .eq("tenant_id", (tenant as any).id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.external_source) {
    return NextResponse.json(
      {
        error:
          "This provider is synced from your booking platform. Deactivate them in the platform, or toggle them off here to hide from the AI.",
      },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("staff")
    .delete()
    .eq("id", id)
    .eq("tenant_id", (tenant as any).id);

  if (error) return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  return NextResponse.json({ success: true });
}
