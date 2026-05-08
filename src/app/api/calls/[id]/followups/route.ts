import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

// Create a follow-up task tied to a specific call_logs row. Used by the
// Ask-Vivienne chat on the call detail page (source: 'chat') and by any
// future "manual add" UI on the tasks page (source: 'manual'). Live-call
// inserts still happen in the Vapi webhook with source='live'.

type Ctx = { params: Promise<{ id: string }> };

const ALLOWED_SOURCES = new Set(["chat", "manual"]);

export async function POST(req: NextRequest, ctx: Ctx) {
  const tenant = (await getCurrentTenant()) as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json()) as { action?: string; source?: string };
  const action = body.action?.trim();
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });
  if (action.length > 500) {
    return NextResponse.json({ error: "action too long" }, { status: 400 });
  }

  // Reject sources we don't expose to the client. 'live' and 'backfill'
  // come from server-side flows only.
  const source = ALLOWED_SOURCES.has(body.source ?? "") ? (body.source as "chat" | "manual") : "chat";

  const { data: call } = await supabaseAdmin
    .from("call_logs")
    .select("id, vapi_call_id, caller_number")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  const { data: row, error } = await supabaseAdmin
    .from("call_followups")
    .insert({
      tenant_id: tenant.id,
      vapi_call_id: call.vapi_call_id,
      call_log_id: call.id,
      customer_phone: call.caller_number,
      action,
      source,
      status: "pending",
    })
    .select("id, action, status, source, created_at, completed_at")
    .single();

  if (error || !row) {
    console.error("FOLLOWUP_INSERT_ERROR:", error);
    return NextResponse.json({ error: "insert failed" }, { status: 500 });
  }

  return NextResponse.json({ followup: row });
}
