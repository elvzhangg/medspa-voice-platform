import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant, getSession } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateClientBrief } from "@/lib/client-brief";

/**
 * GET /api/clients/[id]/brief
 *
 * The "who's walking in and what should I remember?" endpoint. Returns a
 * short prose briefing synthesized from the client's profile + recent
 * call history + upcoming appointments.
 *
 * Tenant isolation: structurally enforced by getCurrentTenant() + every
 * query in generateClientBrief scoping on tenant_id. A staff user from
 * tenant A passing a client_profile_id from tenant B gets 404, not data.
 *
 * Every successful call writes a chat_access_audit row with action='brief_view'.
 * HIPAA wants "who viewed which client when" as a separate trail from
 * "what sources the AI read."
 *
 * No caching yet — the LLM call is ~1-2s and the data changes after every
 * call anyway. Add an in-memory or KV cache keyed on
 * (client_id, summary_updated_at, last_call_at) once the endpoint is hot.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const tenant = (await getCurrentTenant()) as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const brief = await generateClientBrief(tenant.id, id);
  if (!brief) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // HIPAA audit — who viewed which client when. Separate from the
  // "sources the AI read" log (we return sourceCallIds in the response
  // for UI transparency, but don't expand them here).
  const session = await getSession();
  await supabaseAdmin.from("chat_access_audit").insert({
    tenant_id: tenant.id,
    user_id: session?.user?.id ?? null,
    client_profile_id: id,
    action: "brief_view",
    context: { source_count: brief.sourceCallIds.length },
  });

  return NextResponse.json({
    brief: brief.text,
    cold_start: brief.coldStart,
    source_call_ids: brief.sourceCallIds,
    generated_at: brief.generatedAt,
  });
}
