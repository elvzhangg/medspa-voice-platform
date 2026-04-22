"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface ConversationListItem {
  id: string;
  title: string | null;
  client_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

type ChatSource =
  | { kind: "client"; clientProfileId: string; label: string }
  | {
      kind: "call";
      callId: string;
      clientProfileId: string | null;
      label: string;
      when: string;
    }
  | {
      kind: "appointment";
      clientProfileId: string | null;
      label: string;
      when: string;
    };

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: {
    sources?: ChatSource[];
  };
  created_at: string;
}

interface FeedbackRow {
  message_id: string;
  rating: number;
}

const SUGGESTIONS = [
  "Who hasn't called in the last 60 days?",
  "Which clients mentioned a wedding recently?",
  "Who has an appointment tomorrow?",
  "Tell me about our VIP clients.",
];

export default function AssistantPage() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [feedback, setFeedback] = useState<Record<string, number>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/chat/conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations ?? []);
    }
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setLoadingConv(true);
    setActiveId(id);
    const res = await fetch(`/api/chat/conversations/${id}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
      const fbMap: Record<string, number> = {};
      for (const f of (data.feedback ?? []) as FeedbackRow[]) {
        fbMap[f.message_id] = f.rating;
      }
      setFeedback(fbMap);
    }
    setLoadingConv(false);
  }, []);

  function newConversation() {
    setActiveId(null);
    setMessages([]);
    setFeedback({});
  }

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);

    // Optimistic user turn
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: text, created_at: new Date().toISOString() },
    ]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        conversation_id: activeId,
      }),
    });

    if (!res.ok) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Something went wrong. Try again?",
          created_at: new Date().toISOString(),
        },
      ]);
      setSending(false);
      return;
    }

    const data = await res.json();
    setActiveId(data.conversation_id);

    // Swap temp user turn with the real id + append assistant turn
    setMessages((prev) => {
      const replaced = prev.map((m) =>
        m.id === tempId ? { ...m, id: data.user_message_id ?? tempId } : m
      );
      return [
        ...replaced,
        {
          id: data.assistant_message_id ?? `asst-${Date.now()}`,
          role: "assistant" as const,
          content: data.answer,
          metadata: { sources: data.sources },
          created_at: new Date().toISOString(),
        },
      ];
    });
    setSending(false);
    loadConversations();
  }

  async function rate(messageId: string, rating: 1 | -1) {
    const current = feedback[messageId];
    const next = current === rating ? 0 : rating; // toggle off if already set
    setFeedback({ ...feedback, [messageId]: next });
    await fetch("/api/chat/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, rating: next }),
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-8">
      {/* Conversation list */}
      <aside className="w-64 shrink-0 bg-white border-r border-zinc-200 flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-100">
          <button
            onClick={newConversation}
            className="w-full px-3 py-2 bg-zinc-950 hover:bg-zinc-900 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {conversations.length === 0 ? (
            <p className="text-xs text-zinc-400 italic text-center py-8 px-4">
              No conversations yet. Ask something to get started.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => loadConversation(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${
                      activeId === c.id
                        ? "bg-[#fdf9ec] text-amber-800 font-medium"
                        : "text-zinc-600 hover:bg-zinc-50"
                    }`}
                    title={c.title ?? "Untitled"}
                  >
                    {c.title ?? "Untitled"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Main panel */}
      <main className="flex-1 flex flex-col bg-zinc-50">
        <div className="flex-1 overflow-y-auto px-8 py-8" ref={scrollRef}>
          {loadingConv ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState onSuggestion={(s) => setInput(s)} />
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  rating={feedback[m.id] ?? 0}
                  onRate={rate}
                />
              ))}
              {sending && (
                <div className="flex items-center gap-2 text-zinc-400 text-sm italic">
                  <div className="w-3 h-3 border-2 border-zinc-300 border-t-transparent rounded-full animate-spin" />
                  Thinking…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-zinc-200 bg-white px-8 py-4">
          <div className="max-w-3xl mx-auto flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Ask about a client, filter by tag, search across notes…"
              className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none text-sm resize-none"
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="px-5 py-3 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              Send
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 text-center mt-2 max-w-3xl mx-auto">
            Answers come from your clinic's own call history and client notes. Never invents.
          </p>
        </div>
      </main>
    </div>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div className="max-w-2xl mx-auto text-center pt-16">
      <div className="w-14 h-14 bg-zinc-950 ring-1 ring-amber-400/50 rounded-2xl mx-auto mb-6 flex items-center justify-center">
        <svg className="w-7 h-7 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </div>
      <h2 className="font-serif text-2xl text-zinc-900 mb-6">Ask about your clients</h2>
      <div className="grid grid-cols-2 gap-2 max-w-xl mx-auto">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="text-left px-4 py-3 bg-white border border-zinc-200 hover:border-amber-300 hover:bg-[#fdf9ec]/40 rounded-xl text-sm text-zinc-700 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  rating,
  onRate,
}: {
  message: ChatMessage;
  rating: number;
  onRate: (id: string, r: 1 | -1) => void;
}) {
  const sources = message.metadata?.sources ?? [];

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-zinc-950 text-white rounded-2xl rounded-tr-sm px-4 py-3 max-w-xl text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      {/* AI avatar — charcoal disc with a gold ring, nodding to the
          landing's champagne noir shimmer. */}
      <div className="w-8 h-8 shrink-0 bg-zinc-950 ring-1 ring-amber-400/60 rounded-full flex items-center justify-center text-amber-300 text-[11px] font-semibold tracking-wider">
        AI
      </div>
      <div className="flex-1">
        <div className="bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-zinc-800 whitespace-pre-wrap shadow-sm">
          {message.content}
        </div>
        {sources.length > 0 && <SourcePills sources={sources} />}
        <div className="flex items-center gap-3 mt-2 px-2">
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onRate(message.id, 1)}
              className={`p-1 rounded transition-colors ${
                rating === 1
                  ? "text-emerald-600 bg-emerald-50"
                  : "text-zinc-300 hover:text-emerald-500"
              }`}
              aria-label="Thumbs up"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 10.5A1.5 1.5 0 013.5 9H5v7H3.5A1.5 1.5 0 012 14.5v-4zm13.75-.5h-2.8l.4-3.4a1.6 1.6 0 00-3.14-.54L8.75 9H7v7h8.25a2 2 0 001.98-1.72l.77-5.28a1.5 1.5 0 00-1.5-1.72z" />
              </svg>
            </button>
            <button
              onClick={() => onRate(message.id, -1)}
              className={`p-1 rounded transition-colors ${
                rating === -1 ? "text-red-600 bg-red-50" : "text-zinc-300 hover:text-red-500"
              }`}
              aria-label="Thumbs down"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M18 9.5A1.5 1.5 0 0016.5 11H15V4h1.5A1.5 1.5 0 0118 5.5v4zM4.25 10h2.8l-.4 3.4a1.6 1.6 0 003.14.54L11.25 11H13V4H4.75a2 2 0 00-1.98 1.72l-.77 5.28a1.5 1.5 0 001.5 1.72z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Clickable pills under each AI reply — the "show your work" affordance.
 * Each source links to the exact record the answer leaned on, so staff
 * can verify provenance without leaving context.
 */
function SourcePills({ sources }: { sources: ChatSource[] }) {
  function hrefFor(s: ChatSource): string {
    if (s.kind === "client") return `/dashboard/clients?profile=${s.clientProfileId}`;
    if (s.kind === "call") {
      const qp = new URLSearchParams({ call: s.callId });
      if (s.clientProfileId) qp.set("profile", s.clientProfileId);
      return `/dashboard/calls?${qp}`;
    }
    // appointment
    return s.clientProfileId
      ? `/dashboard/clients?profile=${s.clientProfileId}`
      : `/dashboard/calendar`;
  }

  function iconFor(kind: ChatSource["kind"]) {
    if (kind === "call") {
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      );
    }
    if (kind === "appointment") {
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }
    return (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    );
  }

  return (
    <div className="mt-2 px-2 flex flex-wrap gap-1.5">
      <span className="text-[11px] text-zinc-400 italic self-center">Source:</span>
      {sources.map((s, i) => (
        <a
          key={`${s.kind}-${i}`}
          href={hrefFor(s)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#fdf9ec] border border-amber-200 text-[11px] text-amber-900 hover:bg-amber-100 hover:border-amber-400 transition-colors"
        >
          <span className="text-amber-600">{iconFor(s.kind)}</span>
          {s.label}
        </a>
      ))}
    </div>
  );
}
