import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type Stage = "top_of_funnel" | "crm" | "rejected";
const STAGE_VALUES: Stage[] = ["top_of_funnel", "crm", "rejected"];
function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGE_VALUES as string[]).includes(v);
}

// GET /api/admin/crm/[id] — full prospect record for the detail page.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { data, error } = await supabaseAdmin
    .from("crm_prospects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ prospect: data });
}

// PATCH /api/admin/crm/[id] — single-prospect updates from the detail page.
// Whitelisted fields only; stage changes maintain the promotion stamp.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const allowed = [
    "business_name",
    "website",
    "email",
    "phone",
    "city",
    "state",
    "address",
    "booking_platform",
    "owner_name",
    "owner_email",
    "owner_title",
    "services_summary",
    "pricing_notes",
    "notes",
  ] as const;
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if ("crm_stage" in body) {
    if (!isStage(body.crm_stage)) {
      return NextResponse.json({ error: "invalid crm_stage" }, { status: 400 });
    }
    updates.crm_stage = body.crm_stage;
    if (body.crm_stage === "crm") {
      updates.crm_promoted_at = new Date().toISOString();
      if (typeof body.actor === "string") updates.crm_promoted_by = body.actor;
    } else {
      updates.crm_promoted_at = null;
      updates.crm_promoted_by = null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("crm_prospects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospect: data });
}

// DELETE /api/admin/crm/[id] — hard delete from the detail page.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { error } = await supabaseAdmin.from("crm_prospects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
