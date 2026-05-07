import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant, createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Mark a call follow-up task as done.
 * Tenant-scoped: a user can only complete tasks belonging to their tenant.
 * RLS on call_followups also enforces this, but we double-check via getCurrentTenant
 * so the response is meaningful (404 vs ambiguous RLS-empty).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tenant = (await getCurrentTenant()) as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supa = await createSupabaseServerClient();
  const { data: { session } } = await supa.auth.getSession();

  const { data, error } = await supabaseAdmin
    .from("call_followups")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by_user_id: session?.user.id ?? null,
    })
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("FOLLOWUP_DONE_ERROR:", error);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
