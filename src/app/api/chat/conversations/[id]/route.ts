import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant, getSession } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/chat/conversations/[id]
 *
 * Load a single conversation + all its user/assistant messages.
 * Tenant + user scoped; returns 404 if not owned by the caller.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const tenant = (await getCurrentTenant()) as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: conv } = await supabaseAdmin
    .from("chat_conversations")
    .select("id, title, client_profile_id, created_at, updated_at, tenant_id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!conv || conv.tenant_id !== tenant.id || conv.user_id !== userId) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: messages } = await supabaseAdmin
    .from("chat_messages")
    .select("id, role, content, metadata, prompt_version, created_at")
    .eq("conversation_id", id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true });

  // Load the caller's own feedback so the UI can highlight thumbs-up/down
  // they've already given.
  const messageIds = (messages ?? []).map((m) => m.id);
  let feedback: Array<{ message_id: string; rating: number }> = [];
  if (messageIds.length) {
    const { data } = await supabaseAdmin
      .from("chat_feedback")
      .select("message_id, rating")
      .in("message_id", messageIds)
      .eq("user_id", userId);
    feedback = (data ?? []) as typeof feedback;
  }

  return NextResponse.json({
    conversation: {
      id: conv.id,
      title: conv.title,
      client_profile_id: conv.client_profile_id,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
    },
    messages: messages ?? [],
    feedback,
  });
}
