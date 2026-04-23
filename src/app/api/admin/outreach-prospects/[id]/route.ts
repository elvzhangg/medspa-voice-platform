import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { computeConfidence } from "@/lib/prospect-confidence";

// GET /api/admin/outreach-prospects/:id
// Returns the prospect + linked demo tenant + recent call logs + timeline events +
// all campaign memberships (prospects are globally unique, can belong to many campaigns).
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

  // All campaigns this prospect belongs to
  const { data: memberships } = await supabaseAdmin
    .from("prospect_campaign_memberships")
    .select("campaign_id, added_at, outreach_campaigns(id, name)")
    .eq("prospect_id", id);

  const campaigns = (memberships ?? [])
    .map((m) => {
      const c = m.outreach_campaigns as unknown as { id: string; name: string } | null;
      return c ? { id: c.id, name: c.name, added_at: m.added_at } : null;
    })
    .filter((x): x is { id: string; name: string; added_at: string } => x !== null);

  // Linked demo tenant + call logs
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

  const { data: events } = await supabaseAdmin
    .from("outreach_prospect_events")
    .select("*")
    .eq("prospect_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  const confidenceBreakdown = computeConfidence(prospect);

  return NextResponse.json({
    prospect,
    campaigns,
    demo_tenant: demoTenant,
    call_logs: callLogs,
    events: events ?? [],
    confidence: confidenceBreakdown,
  });
}

// Fields that affect the confidence score — we recompute when any of them change.
const CONFIDENCE_FIELDS = new Set([
  "website", "phone", "email", "owner_name", "owner_email", "address",
  "procedures", "providers", "hours", "research_sources",
]);

// PATCH — structured-field updates. Recomputes research_confidence deterministically
// from the merged post-update prospect whenever a relevant field changes.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const updates: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };

  if (updates.status === "contacted" && !updates.contacted_at) {
    updates.contacted_at = new Date().toISOString();
  }

  // Capture old state (for event logging + confidence recomputation base)
  const { data: current } = await supabaseAdmin
    .from("outreach_prospects")
    .select("*")
    .eq("id", id)
    .single();
  const oldStatus: string | null = current?.status ?? null;

  // If any confidence-relevant field changed, recompute from the merged record.
  const shouldRecompute = Object.keys(updates).some((k) => CONFIDENCE_FIELDS.has(k));
  if (shouldRecompute && current) {
    const merged = { ...current, ...updates };
    updates.research_confidence = computeConfidence(merged).score;
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
