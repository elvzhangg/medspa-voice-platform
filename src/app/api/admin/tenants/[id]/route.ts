import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Fetch tenant
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .select("*")
    .eq("id", id)
    .single();

  if (tenantError || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  // Fetch KB doc count
  const { count: kbCount } = await supabaseAdmin
    .from("knowledge_base_documents")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", id);

  // Fetch recent calls
  const { data: calls } = await supabaseAdmin
    .from("call_logs")
    .select("id, caller_number, duration_seconds, summary, created_at")
    .eq("tenant_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Fetch referral count
  const { count: referralCount } = await supabaseAdmin
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", id);

  return NextResponse.json({
    tenant,
    kbCount: kbCount ?? 0,
    calls: calls ?? [],
    referralCount: referralCount ?? 0,
  });
}
