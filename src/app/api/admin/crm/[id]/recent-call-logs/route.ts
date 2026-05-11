import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// GET /api/admin/crm/[id]/recent-call-logs
//
// Diagnostic: shows the last call_logs rows for this prospect's tenant +
// any debug-log rows from the last 24h. Used to verify whether our webhook
// is actually being hit during real calls — if Vapi connects at SIP but
// our webhook never sees the assistant-request, we'd see Vapi calls in
// the previous diagnostic without matching call_logs entries here.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: prospect } = await supabaseAdmin
    .from("crm_prospects")
    .select("tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (!prospect?.tenant_id) {
    return NextResponse.json({ error: "Prospect not activated" }, { status: 400 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: tenantCalls } = await supabaseAdmin
    .from("call_logs")
    .select("*")
    .eq("tenant_id", prospect.tenant_id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  // Also pull the global "debug-log" rows that /api/vapi/log inserts on every
  // raw payload — useful if someone temporarily reroutes serverUrl to /log.
  const { data: debugLogs } = await supabaseAdmin
    .from("call_logs")
    .select("*")
    .eq("caller_number", "debug-log")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    tenant_id: prospect.tenant_id,
    tenant_calls_last_24h: tenantCalls ?? [],
    debug_logs_last_24h: debugLogs ?? [],
  });
}
