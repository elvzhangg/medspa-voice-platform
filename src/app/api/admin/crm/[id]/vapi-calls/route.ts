import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const VAPI_API_KEY = process.env.VAPI_API_KEY!;

// GET /api/admin/crm/[id]/vapi-calls
//
// Diagnostic-only: fetches the last few Vapi call attempts for the prospect's
// phone number, so we can see *what Vapi sees* when calls come in — failure
// codes, ended reasons, durations. Pairs with diagnose-number when the app
// side is healthy but the number still won't connect.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { data: prospect } = await supabaseAdmin
    .from("crm_prospects")
    .select("id, business_name, tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  if (!prospect.tenant_id) {
    return NextResponse.json({ error: "Prospect not activated yet" }, { status: 400 });
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, name, vapi_phone_number_id")
    .eq("id", prospect.tenant_id)
    .maybeSingle();
  if (!tenant?.vapi_phone_number_id) {
    return NextResponse.json({ error: "Tenant has no vapi_phone_number_id" }, { status: 400 });
  }

  // Vapi's call-list endpoint supports phoneNumberId filter + limit.
  const url = new URL("https://api.vapi.ai/call");
  url.searchParams.set("phoneNumberId", tenant.vapi_phone_number_id);
  url.searchParams.set("limit", "20");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Vapi /call returned ${res.status}: ${text.slice(0, 500)}` },
      { status: 500 }
    );
  }

  const calls = (await res.json()) as Array<Record<string, unknown>>;

  // Whittle each call down to fields useful for debugging. Vapi's full call
  // object is huge; we want status, endedReason, duration, who called, and
  // any transcript/assistant errors.
  const trimmed = calls.map((c) => ({
    id: c.id,
    createdAt: c.createdAt,
    status: c.status,
    endedReason: c.endedReason,
    type: c.type,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    durationSeconds:
      c.startedAt && c.endedAt
        ? Math.round(
            (new Date(c.endedAt as string).getTime() -
              new Date(c.startedAt as string).getTime()) /
              1000
          )
        : null,
    customer:
      typeof c.customer === "object" && c.customer !== null
        ? (c.customer as { number?: string }).number ?? null
        : null,
    assistantId: c.assistantId ?? null,
    cost: c.cost ?? null,
    transport:
      typeof c.transport === "object" && c.transport !== null ? c.transport : null,
    // Common error fields Vapi attaches when things fail.
    errorMessage: c.errorMessage ?? c.error ?? null,
  }));

  return NextResponse.json({
    tenant_name: tenant.name,
    vapi_phone_number_id: tenant.vapi_phone_number_id,
    call_count: trimmed.length,
    calls: trimmed,
  });
}
