import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/admin/outreach-prospects/:id
// Returns the prospect row + its provisioned demo tenant (if any), recent call logs
// on that demo number, and the event timeline.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { data: prospect, error } = await supabaseAdmin
    .from("outreach_prospects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  // Fetch linked demo tenant, if provisioned
  let demoTenant = null;
  let callLogs: Array<Record<string, unknown>> = [];
  if (prospect.demo_tenant_id) {
    const { data: t } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .eq("id", prospect.demo_tenant_id)
      .single();
    demoTenant = t ?? null;

    const { data: logs } = await supabaseAdmin
      .from("call_logs")
      .select("id, caller_number, duration_seconds, summary, created_at")
      .eq("tenant_id", prospect.demo_tenant_id)
      .order("created_at", { ascending: false })
      .limit(25);
    callLogs = logs ?? [];
  }

  // Timeline events
  const { data: events } = await supabaseAdmin
    .from("outreach_prospect_events")
    .select("*")
    .eq("prospect_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({
    prospect,
    demo_tenant: demoTenant,
    call_logs: callLogs,
    events: events ?? [],
  });
}

// PATCH — structured-field updates; logs a timeline event for status changes.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const updates = { ...body, updated_at: new Date().toISOString() };

  // Preserve status-change auditing that the list endpoint already does
  if (updates.status === "contacted" && !updates.contacted_at) {
    updates.contacted_at = new Date().toISOString();
  }

  // Capture old status for event log
  let oldStatus: string | null = null;
  if (updates.status) {
    const { data: current } = await supabaseAdmin
      .from("outreach_prospects")
      .select("status")
      .eq("id", id)
      .single();
    oldStatus = current?.status ?? null;
  }

  const { data, error } = await supabaseAdmin
    .from("outreach_prospects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (updates.status && oldStatus && oldStatus !== updates.status) {
    await supabaseAdmin.from("outreach_prospect_events").insert({
      prospect_id: id,
      event_type: "status_changed",
      summary: `Status: ${oldStatus} → ${updates.status}`,
      payload: { old_status: oldStatus, new_status: updates.status },
      actor: "user",
    });
  }

  return NextResponse.json({ prospect: data });
}
