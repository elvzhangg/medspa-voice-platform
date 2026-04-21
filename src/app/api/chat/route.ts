import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant, getSession } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { runChatTurn, generateConversationTitle } from "@/lib/chat-engine";

/**
 * POST /api/chat
 *
 * Main staff-chat endpoint. Takes a user message (plus optional
 * conversation_id and client_profile_id), runs the chat engine, persists
 * both turns (user + assistant) to chat_messages, writes a HIPAA audit
 * row, and returns the answer + sources + message_ids for feedback.
 *
 * Tenant isolation is structural:
 *   - getCurrentTenant() validates the caller's session
 *   - chat-tools.ts scopes every DB read on tenant_id
 *   - conversation_id is re-verified against the caller's tenant before load
 *
 * No streaming in this cut; the UI blocks on the final answer.
 */

interface ChatRequestBody {
  message?: string;
  conversation_id?: string;
  client_profile_id?: string;
}

export async function POST(req: NextRequest) {
  const tenant = (await getCurrentTenant()) as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as ChatRequestBody;
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Resolve or create conversation, re-verifying tenant + user on load.
  let conversationId = body.conversation_id ?? null;
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (conversationId) {
    const { data: conv } = await supabaseAdmin
      .from("chat_conversations")
      .select("id, tenant_id, user_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv || conv.tenant_id !== tenant.id || conv.user_id !== userId) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const { data: past } = await supabaseAdmin
      .from("chat_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(20);
    history = ((past ?? []) as Array<{ role: "user" | "assistant"; content: string }>).slice(-10);
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("chat_conversations")
      .insert({
        tenant_id: tenant.id,
        user_id: userId,
        client_profile_id: body.client_profile_id ?? null,
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("CHAT_CONVERSATION_CREATE_ERR:", error);
      return NextResponse.json({ error: "Failed to start conversation" }, { status: 500 });
    }
    conversationId = created.id;
  }

  // Persist the user turn BEFORE running the engine so if the LLM hangs
  // the user message isn't lost.
  const userMessageInsert = await supabaseAdmin
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      tenant_id: tenant.id,
      role: "user",
      content: message,
    })
    .select("id")
    .single();

  // Run the engine.
  const result = await runChatTurn({
    tenantId: tenant.id,
    history,
    message,
    clientProfileId: body.client_profile_id,
  });

  // Persist the assistant turn + source metadata + prompt version.
  const { data: assistantRow } = await supabaseAdmin
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      tenant_id: tenant.id,
      role: "assistant",
      content: result.answer,
      metadata: {
        sources: result.sources,
        tool_calls: result.toolCalls,
      },
      prompt_version: result.promptVersion,
    })
    .select("id")
    .single();

  // Bump conversation.updated_at + auto-title on first turn.
  const convUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (history.length === 0) {
    convUpdate.title = await generateConversationTitle(message);
  }
  await supabaseAdmin.from("chat_conversations").update(convUpdate).eq("id", conversationId);

  // HIPAA audit: one row per distinct client touched during the turn.
  // Separate from chat_messages.metadata — different purpose, different
  // retention trajectory.
  if (result.sources.length > 0) {
    const auditRows = result.sources.map((s) => ({
      tenant_id: tenant.id,
      user_id: userId,
      client_profile_id: s.clientProfileId,
      action: "chat_query" as const,
      context: {
        conversation_id: conversationId,
        message_id: assistantRow?.id ?? null,
        tool_calls: result.toolCalls.map((t) => t.name),
      },
    }));
    await supabaseAdmin.from("chat_access_audit").insert(auditRows);
  }

  return NextResponse.json({
    conversation_id: conversationId,
    user_message_id: userMessageInsert.data?.id ?? null,
    assistant_message_id: assistantRow?.id ?? null,
    answer: result.answer,
    sources: result.sources,
  });
}
