import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// GET /api/admin/crm/[id]/activate
// Returns the prospect row + its activation_state JSONB. The page hits this on
// load and after every step mutation to keep the UI in sync.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin
    .from("crm_prospects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Pull the linked tenant if activation already created one — useful for the
  // page header to show "already activated" state.
  let tenant: Record<string, unknown> | null = null;
  if (data.tenant_id) {
    const { data: t } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug, phone_number, vapi_phone_number_id")
      .eq("id", data.tenant_id)
      .maybeSingle();
    tenant = t ?? null;
  }
  return NextResponse.json({ prospect: data, tenant });
}
