"use client";

import { useState, useEffect, useRef } from "react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls: Array<{ id: string; name: string; input: Record<string, unknown> }> | null;
  tool_results: Array<{ tool_use_id: string; content: string }> | null;
  created_at: string;
}

interface StreamEvent {
  type: "text" | "tool_call" | "tool_result" | "done" | "error";
  text?: string;
  message?: string;
  name?: string;
  input?: Record<string, unknown>;
  result?: string;
}

interface LiveEntry {
  id: string;
  kind: "text" | "tool_call" | "tool_result" | "error";
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  result?: string;
}

export default function OpsChat({
  prospectId,
  open,
  onClose,
  onDataChanged,
}: {
  prospectId: string;
  open: boolean;
  onClose: () => void;
  onDataChanged: () => void;
}) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [live, setLive] = useState<LiveEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const liveIdRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  async function loadHistory() {
    const res = await fetch(`/api/admin/agent/ops-chat?prospect_id=${prospectId}`);
    const data = await res.json();
    setHistory(data.messages ?? []);
  }

  useEffect(() => {
    if (!open) return;
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prospectId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, live]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    const userMsg = input.trim();
    setInput("");
    setStreaming(true);
    // Optimistically append user's message
    setHistory((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: userMsg, tool_calls: null, tool_results: null, created_at: new Date().toISOString() },
    ]);
    setLive([]);

    try {
      const res = await fetch("/api/admin/agent/ops-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospectId, message: userMsg }),
      });
      if (!res.ok || !res.body) {
        addLive({ kind: "error", text: `Server error: ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(part.slice(6)) as StreamEvent;
            if (ev.type === "text" && ev.text) {
              addLive({ kind: "text", text: ev.text });
            } else if (ev.type === "tool_call") {
              addLive({ kind: "tool_call", name: ev.name, input: ev.input });
            } else if (ev.type === "tool_result") {
              addLive({ kind: "tool_result", name: ev.name, result: ev.result });
              onDataChanged(); // refresh parent data after any tool run
            } else if (ev.type === "error") {
              addLive({ kind: "error", text: ev.message });
            }
            // "done" — just exit; history reload happens below
          } catch {
            // malformed chunk, skip
          }
        }
      }
    } catch (err) {
      addLive({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setStreaming(false);
      await loadHistory();
      setLive([]);
      onDataChanged();
    }
  }

  function addLive(partial: Omit<LiveEntry, "id">) {
    const id = `live-${++liveIdRef.current}`;
    setLive((prev) => {
      // Coalesce consecutive text chunks into one bubble
      if (partial.kind === "text" && prev.length && prev[prev.length - 1].kind === "text") {
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...last, text: (last.text ?? "") + (partial.text ?? "") }];
      }
      return [...prev, { id, ...partial }];
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[440px] bg-white border-l border-gray-200 shadow-2xl z-40 flex flex-col">
      <header className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-semibold text-sm text-gray-900">Ops Chat</h3>
          <p className="text-xs text-gray-400 mt-0.5">Edit this prospect, regenerate artifacts</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {history.length === 0 && live.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 mb-1">Ask the agent to edit this prospect</p>
            <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
              Examples:<br />
              <span className="italic">&quot;Botox is $14/unit, not $12&quot;</span><br />
              <span className="italic">&quot;Add Morpheus8 at $600, 45 min&quot;</span><br />
              <span className="italic">&quot;Regenerate the email&quot;</span><br />
              <span className="italic">&quot;Hours Sat 10am–3pm, closed Sun&quot;</span>
            </p>
          </div>
        )}

        {history.map((m) => (
          <HistoryBubble key={m.id} msg={m} />
        ))}

        {live.map((entry) => (
          <LiveBubble key={entry.id} entry={entry} />
        ))}

        {streaming && live.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
            Thinking…
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="border-t border-gray-100 p-3 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            placeholder="Ask or instruct…"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-gray-50"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function HistoryBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 bg-indigo-600 text-white rounded-2xl rounded-br-sm text-sm">
          {msg.content}
        </div>
      </div>
    );
  }
  if (msg.role === "assistant") {
    return (
      <div className="space-y-1.5">
        {msg.content && (
          <div className="max-w-[90%] px-3 py-2 bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm text-sm whitespace-pre-wrap">
            {msg.content}
          </div>
        )}
        {msg.tool_calls?.map((tc) => (
          <div key={tc.id} className="text-[11px] font-mono text-violet-600 bg-violet-50 border border-violet-100 rounded-lg px-2 py-1 inline-block">
            🔧 {tc.name}
          </div>
        ))}
      </div>
    );
  }
  // tool role — compact success/failure pills
  return (
    <div className="space-y-1">
      {msg.tool_results?.map((tr, i) => {
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(tr.content);
        } catch {
          // leave null
        }
        const ok = parsed?.ok === true;
        return (
          <div
            key={i}
            className={`text-[11px] font-mono rounded-lg px-2 py-1 inline-block ${
              ok ? "text-emerald-700 bg-emerald-50 border border-emerald-100" : "text-red-700 bg-red-50 border border-red-100"
            }`}
          >
            {ok ? "✓" : "✗"} {parsed?.error ? String(parsed.error) : "done"}
          </div>
        );
      })}
    </div>
  );
}

function LiveBubble({ entry }: { entry: LiveEntry }) {
  if (entry.kind === "text") {
    return (
      <div className="max-w-[90%] px-3 py-2 bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm text-sm whitespace-pre-wrap">
        {entry.text}
      </div>
    );
  }
  if (entry.kind === "tool_call") {
    return (
      <div className="text-[11px] font-mono text-violet-600 bg-violet-50 border border-violet-100 rounded-lg px-2 py-1 inline-block">
        🔧 {entry.name} <span className="text-violet-400">running…</span>
      </div>
    );
  }
  if (entry.kind === "tool_result") {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(entry.result ?? "{}");
    } catch {
      // leave null
    }
    const ok = parsed?.ok === true;
    return (
      <div
        className={`text-[11px] font-mono rounded-lg px-2 py-1 inline-block ${
          ok ? "text-emerald-700 bg-emerald-50 border border-emerald-100" : "text-red-700 bg-red-50 border border-red-100"
        }`}
      >
        {ok ? "✓" : "✗"} {entry.name} {parsed?.error ? `— ${String(parsed.error)}` : ""}
      </div>
    );
  }
  return (
    <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1 inline-block">
      ⚠️ {entry.text}
    </div>
  );
}
