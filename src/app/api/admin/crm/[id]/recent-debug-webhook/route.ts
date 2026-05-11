import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// GET /api/admin/crm/[id]/recent-debug-webhook
//
// Returns the most recent `debug-webhook:*` rows from call_logs — these are
// raw inbound Vapi payloads and our outbound assistant responses, captured
// fire-and-forget from /api/vapi/webhook. Used during live debugging when
// Vapi rejects the assistant config and we need to see exactly what was sent.
export async function GET(_req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("call_logs")
    .select("id, vapi_call_id, caller_number, summary, created_at")
    .like("caller_number", "debug-webhook:%")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}
