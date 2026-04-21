import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant, getSession } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/chat/conversations
 *   ?client_id=<uuid>  optional filter
 *
 * Returns the caller's own conversations within the current tenant.
 * Used by the assistant page sidebar.
 */

export async function GET(req: NextRequest) {
  const tenant = (await getCurrentTenant()) as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");

  let q = supabaseAdmin
    .from("chat_conversations")
    .select("id, title, client_profile_id, created_at, updated_at")
    .eq("tenant_id", tenant.id)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (clientId) q = q.eq("client_profile_id", clientId);

  const { data, error } = await q;
  if (error) {
    console.error("CHAT_CONVERSATIONS_LIST_ERR:", error);
    return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 });
  }

  return NextResponse.json({ conversations: data ?? [] });
}
