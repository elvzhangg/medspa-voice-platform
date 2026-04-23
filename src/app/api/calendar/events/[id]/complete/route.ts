import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant, getSession } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/calendar/events/[id]/complete — staff marks an appointment
// completed. This is what the aftercare SMS cron keys off: without it, the
// followup never fires. Platform webhooks (Boulevard/Mindbody/Square) also
// land in this table with source='webhook_*' — same downstream effect.
export async function POST(req: NextRequest, ctx: Ctx) {
  const tenant = (await getCurrentTenant()) as { id: string } | null;
  const session = await getSession();
  if (!tenant || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { undo?: boolean };
  const undo = body.undo === true;

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("calendar_events")
    .select("id, tenant_id, status, completed_at")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const patch = undo
    ? { status: "confirmed", completed_at: null, completed_by_user_id: null, completion_source: null }
    : {
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by_user_id: session.user.id,
        completion_source: "manual",
      };

  const { error: updateErr } = await supabaseAdmin
    .from("calendar_events")
    .update(patch)
    .eq("id", id);

  if (updateErr) {
    console.error("COMPLETE_EVENT_UPDATE_ERROR:", updateErr);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await supabaseAdmin.from("appointment_audit_log").insert({
    tenant_id: tenant.id,
    calendar_event_id: id,
    user_id: session.user.id,
    action: undo ? "updated" : "completed",
    source: "manual",
    metadata: { previous_status: existing.status, undo },
  });

  return NextResponse.json({ success: true });
}
