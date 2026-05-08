"use client";

import { useState, useRef, useEffect } from "react";

export interface CallDetailFollowup {
  id: string;
  action: string;
  status: "pending" | "done";
  source: "live" | "chat" | "backfill" | "manual";
  created_at: string;
  completed_at: string | null;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  // When the assistant is proposing a new follow-up task, the user must
  // confirm before it lands in the tasks list. Cleared after action.
  proposedTask?: { action: string } | null;
}

interface Props {
  callId: string;
  callerPhone: string | null;
  callDurationSeconds: number | null;
  callSummary: string | null;
  callTranscript: string | null;
  callCreatedAt: string;
  initialFollowups: CallDetailFollowup[];
}

const SOURCE_BADGE: Record<CallDetailFollowup["source"], string> = {
  live: "bg-amber-50 text-amber-800 border-amber-200",
  chat: "bg-violet-50 text-violet-800 border-violet-200",
  backfill: "bg-zinc-50 text-zinc-700 border-zinc-200",
  manual: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export default function CallDetailView(props: Props) {
  const [followups, setFollowups] = useState<CallDetailFollowup[]>(props.initialFollowups);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [confirmingTaskIdx, setConfirmingTaskIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  async function markDone(id: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/calls/followups/${id}/done`, { method: "POST" });
      if (res.ok) {
        setFollowups((list) =>
          list.map((f) =>
            f.id === id
              ? { ...f, status: "done" as const, completed_at: new Date().toISOString() }
              : f
          )
        );
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function sendChat() {
    if (!input.trim() || thinking) return;
    const userMsg: ChatMsg = { role: "user", content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setThinking(true);
    setError(null);

    try {
      const res = await fetch(`/api/calls/${props.callId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Vivienne is unavailable");
      const data = (await res.json()) as {
        reply: string;
        proposedTask?: { action: string } | null;
      };
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.reply || "—",
          proposedTask: data.proposedTask ?? null,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setThinking(false);
    }
  }

  async function confirmTask(msgIdx: number, action: string) {
    setConfirmingTaskIdx(msgIdx);
    setError(null);
    try {
      const res = await fetch(`/api/calls/${props.callId}/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, source: "chat" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Couldn't add task");
      const data = (await res.json()) as { followup: CallDetailFollowup };
      setFollowups((list) => [...list, data.followup]);
      // Clear the proposal so the chat row no longer shows confirm buttons.
      setMessages((list) =>
        list.map((m, i) => (i === msgIdx ? { ...m, proposedTask: null } : m))
      );
      setMessages((list) => [
        ...list,
        { role: "assistant", content: "Added. You'll see it in the tasks list above." },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add task");
    } finally {
      setConfirmingTaskIdx(null);
    }
  }

  function dismissTaskProposal(msgIdx: number) {
    setMessages((list) =>
      list.map((m, i) => (i === msgIdx ? { ...m, proposedTask: null } : m))
    );
  }

  const pendingCount = followups.filter((f) => f.status === "pending").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* LEFT: meta + tasks + transcript */}
      <div className="lg:col-span-3 space-y-4">
        {/* Call meta */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="flex items-baseline gap-3">
            <p className="text-lg font-bold text-zinc-900">
              {formatPhone(props.callerPhone) || "Unknown caller"}
            </p>
            <p className="text-xs text-zinc-500">
              {new Date(props.callCreatedAt).toLocaleString("en-US")}
              {props.callDurationSeconds
                ? ` · ${formatDur(props.callDurationSeconds)}`
                : ""}
            </p>
          </div>
          {props.callSummary && (
            <div className="mt-3 pt-3 border-t border-zinc-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Summary
              </p>
              <p className="text-sm text-zinc-700 mt-1 leading-relaxed">
                {props.callSummary}
              </p>
            </div>
          )}
        </div>

        {/* Tasks */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-zinc-900">
              Tasks
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  {pendingCount} pending
                </span>
              )}
            </h2>
          </div>
          {followups.length === 0 ? (
            <p className="text-xs text-zinc-400 leading-relaxed">
              No tasks for this call yet. Ask Vivienne to add one →
            </p>
          ) : (
            <ul className="space-y-1.5">
              {followups.map((f) => (
                <li
                  key={f.id}
                  className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${
                    f.status === "done"
                      ? "border-zinc-200 bg-zinc-50/50 text-zinc-400 line-through"
                      : "border-amber-200 bg-amber-50/30 text-zinc-800"
                  }`}
                >
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${SOURCE_BADGE[f.source]}`}
                    title={`Source: ${f.source}`}
                  >
                    {f.source}
                  </span>
                  <span className="flex-1">{f.action}</span>
                  {f.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => markDone(f.id)}
                      disabled={updatingId === f.id}
                      className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
                    >
                      {updatingId === f.id ? "…" : "Mark done"}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[11px] uppercase tracking-wider text-zinc-400">
                      Done
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Transcript */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">
            Transcript
          </p>
          {props.callTranscript ? (
            <pre className="text-xs text-zinc-600 whitespace-pre-wrap bg-zinc-50/60 rounded-lg border border-zinc-100 p-4 max-h-[480px] overflow-y-auto font-sans leading-relaxed">
              {props.callTranscript}
            </pre>
          ) : (
            <p className="text-xs text-zinc-400">No transcript captured for this call.</p>
          )}
        </div>
      </div>

      {/* RIGHT: Ask Vivienne */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden flex flex-col h-[720px] sticky top-4">
          <div className="px-5 py-3 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-900">Ask Vivienne</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Questions about the call, or ask her to add a follow-up task.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
            {messages.length === 0 && !thinking && (
              <div className="text-center py-8">
                <p className="text-sm font-semibold text-zinc-700">
                  What did the caller want?
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto leading-relaxed">
                  Try: <em>&ldquo;Did they ask about pricing?&rdquo;</em> ·{" "}
                  <em>&ldquo;Add a task to text her the HydraFacial menu&rdquo;</em>
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                <div
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-amber-50 text-amber-900 border border-amber-200"
                        : "bg-zinc-50 text-zinc-800 border border-zinc-150"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
                {m.role === "assistant" && m.proposedTask && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-700 mb-1">
                      New task
                    </p>
                    <p className="text-sm text-zinc-800 leading-relaxed">
                      {m.proposedTask.action}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          confirmTask(i, m.proposedTask!.action)
                        }
                        disabled={confirmingTaskIdx === i}
                        className="rounded-md border border-violet-400 bg-white px-2.5 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                      >
                        {confirmingTaskIdx === i ? "Adding…" : "Add task"}
                      </button>
                      <button
                        type="button"
                        onClick={() => dismissTaskProposal(i)}
                        disabled={confirmingTaskIdx === i}
                        className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="bg-zinc-50 text-zinc-500 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-sm italic">
                  Vivienne is thinking…
                </div>
              </div>
            )}
            {error && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                {error}
              </p>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="border-t border-zinc-100 px-3 py-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                  }
                }}
                disabled={thinking}
                placeholder="Ask Vivienne about this call…"
                className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none disabled:opacity-50"
              />
              <button
                onClick={sendChat}
                disabled={thinking || !input.trim()}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-amber-400 text-amber-900 hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDur(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatPhone(phone: string | null): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}
