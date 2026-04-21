"use client";

import { useState, useEffect, useCallback, useRef } from"react";

interface ConversationListItem {
 id: string;
 title: string | null;
 client_profile_id: string | null;
 created_at: string;
 updated_at: string;
}

interface ChatMessage {
 id: string;
 role:"user" |"assistant";
 content: string;
 metadata?: {
 sources?: Array<{ kind: string; clientProfileId: string; label: string }>;
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
 { id: tempId, role:"user", content: text, created_at: new Date().toISOString() },
 ]);

 const res = await fetch("/api/chat", {
 method:"POST",
 headers: {"Content-Type":"application/json" },
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
 role:"assistant",
 content:"Something went wrong. Try again?",
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
 role:"assistant" as const,
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
 method:"POST",
 headers: {"Content-Type":"application/json" },
 body: JSON.stringify({ message_id: messageId, rating: next }),
 });
 }

 return (
 <div className="flex h-[calc(100vh-4rem)] -m-8">
 {/* Conversation list */}
 <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col">
 <div className="px-4 py-3 border-b border-gray-100">
 <button
 onClick={newConversation}
 className="w-full px-3 py-2 bg-white border border-amber-200 hover:bg-[#fdf9ec] border border-amber-300 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2"
 >
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
 </svg>
 New chat
 </button>
 </div>
 <div className="flex-1 overflow-y-auto px-2 py-2">
 {conversations.length === 0 ? (
 <p className="text-xs text-gray-400 italic text-center py-8 px-4">
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
 ?"bg-amber-50 text-amber-800 font-medium"
 :"text-gray-600 hover:bg-[#fdf9ec]"
 }`}
 title={c.title ??"Untitled"}
 >
 {c.title ??"Untitled"}
 </button>
 </li>
 ))}
 </ul>
 )}
 </div>
 </aside>

 {/* Main panel */}
 <main className="flex-1 flex flex-col bg-[#fdf9ec]">
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
 <div className="flex items-center gap-2 text-gray-400 text-sm italic">
 <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
 Thinking…
 </div>
 )}
 </div>
 )}
 </div>

 {/* Input */}
 <div className="border-t border-gray-200 bg-white px-8 py-4">
 <div className="max-w-3xl mx-auto flex gap-3">
 <textarea
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={(e) => {
 if (e.key ==="Enter" && !e.shiftKey) {
 e.preventDefault();
 send();
 }
 }}
 rows={1}
 placeholder="Ask about a client, filter by tag, search across notes…"
 className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-[#fdf9ec] focus:ring-2 focus:ring-amber-500 focus:bg-white outline-none text-sm resize-none"
 />
 <button
 onClick={send}
 disabled={!input.trim() || sending}
 className="px-5 py-3 bg-white border border-amber-200 hover:bg-[#fdf9ec] border border-amber-300 disabled:opacity-50 text-white text-sm font-semibold rounded-xl"
 >
 Send
 </button>
 </div>
 <p className="text-[11px] text-gray-400 text-center mt-2 max-w-3xl mx-auto">
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
 <div className="w-14 h-14 bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl mx-auto mb-5 flex items-center justify-center">
 <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
 </svg>
 </div>
 <h2 className="text-xl font-bold text-gray-900 mb-1">Ask about your clients</h2>
 <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
 Everything you remember, even the things only one of you remembered. Pulls from call transcripts, notes, and appointments.
 </p>
 <div className="grid grid-cols-2 gap-2 max-w-xl mx-auto">
 {SUGGESTIONS.map((s) => (
 <button
 key={s}
 onClick={() => onSuggestion(s)}
 className="text-left px-4 py-3 bg-white border border-gray-200 hover:border-amber-400 hover:bg-amber-50/40 rounded-xl text-sm text-gray-700 transition-colors"
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

 if (message.role ==="user") {
 return (
 <div className="flex justify-end">
 <div className="bg-white text-amber-900 border border-amber-200 rounded-2xl rounded-tr-sm px-4 py-3 max-w-xl text-sm whitespace-pre-wrap">
 {message.content}
 </div>
 </div>
 );
 }

 return (
 <div className="flex gap-3">
 <div className="w-8 h-8 shrink-0 bg-gradient-to-br from-amber-50 to-amber-100 rounded-full flex items-center justify-center text-white text-xs font-bold">
 AI
 </div>
 <div className="flex-1">
 <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap">
 {message.content}
 </div>
 <div className="flex items-center gap-3 mt-2 px-2">
 {sources.length > 0 && (
 <span className="text-[11px] text-gray-400">
 from {sources.length} client{sources.length === 1 ?"" :"s"}
 {sources.length <= 3 ? `: ${sources.map((s) => s.label).join(",")}` :""}
 </span>
 )}
 <div className="ml-auto flex items-center gap-1">
 <button
 onClick={() => onRate(message.id, 1)}
 className={`p-1 rounded transition-colors ${
 rating === 1
 ?"text-emerald-600 bg-emerald-50"
 :"text-gray-300 hover:text-emerald-500"
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
 rating === -1 ?"text-red-600 bg-red-50" :"text-gray-300 hover:text-red-500"
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
