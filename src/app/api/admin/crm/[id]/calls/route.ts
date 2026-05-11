import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// GET /api/admin/crm/[id]/calls
// Returns the prospect + the list of calls received on its assigned Vapi
// number. Falls back to an empty list if the prospect hasn't been activated
// (no tenant_id).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { data: prospect, error: pErr } = await supabaseAdmin
    .from("crm_prospects")
    .select("id, business_name, tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!prospect.tenant_id) {
    return NextResponse.json({ prospect, tenant: null, calls: [] });
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, name, phone_number, vapi_phone_number_id")
    .eq("id", prospect.tenant_id)
    .maybeSingle();

  // Newest first. Cap to keep payload small — usually a handful of calls.
  const { data: calls, error: cErr } = await supabaseAdmin
    .from("call_logs")
    .select("id, vapi_call_id, caller_number, duration_seconds, summary, transcript, created_at")
    .eq("tenant_id", prospect.tenant_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  return NextResponse.json({ prospect, tenant: tenant ?? null, calls: calls ?? [] });
}
