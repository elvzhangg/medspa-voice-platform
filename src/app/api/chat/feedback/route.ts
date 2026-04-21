import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant, getSession } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/chat/feedback
 *
 * Record thumbs-up / thumbs-down on an assistant message. Upserts on
 * (message_id, user_id) so toggling just overwrites. Passing rating=0
 * clears the user's feedback.
 *
 * This is the only signal we get about answer quality in production.
 * Do NOT skip wiring this up.
 */

interface FeedbackBody {
  message_id?: string;
  rating?: number;       // 1, -1, or 0 (clear)
  comment?: string;
}

export async function POST(req: NextRequest) {
  const tenant = (await getCurrentTenant()) as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as FeedbackBody;
  const messageId = body.message_id;
  const rating = body.rating;

  if (!messageId || (rating !== 1 && rating !== -1 && rating !== 0)) {
    return NextResponse.json(
      { error: "message_id and rating (1, -1, or 0) required" },
      { status: 400 }
    );
  }

  // Verify the message belongs to a conversation this user owns in this tenant.
  const { data: msg } = await supabaseAdmin
    .from("chat_messages")
    .select("id, tenant_id, role, conversation_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg || msg.tenant_id !== tenant.id || msg.role !== "assistant") {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  const { data: conv } = await supabaseAdmin
    .from("chat_conversations")
    .select("user_id")
    .eq("id", msg.conversation_id)
    .maybeSingle();
  if (conv?.user_id !== userId) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (rating === 0) {
    await supabaseAdmin
      .from("chat_feedback")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId);
    return NextResponse.json({ success: true, cleared: true });
  }

  const { error } = await supabaseAdmin.from("chat_feedback").upsert(
    {
      tenant_id: tenant.id,
      message_id: messageId,
      user_id: userId,
      rating,
      comment: body.comment ?? null,
    },
    { onConflict: "message_id,user_id" }
  );
  if (error) {
    console.error("CHAT_FEEDBACK_UPSERT_ERR:", error);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
