"use client";

import { useState, useRef, useEffect } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  callId: string;
  callerPhone: string;
  callerName: string;
  callerTotalCalls: number | null;
  callSummary: string;
  callDurationSeconds: number | null;
  callCreatedAt: string;
}

export default function FollowupCoPilot(props: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [input, setInput] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, drafting]);

  async function handleSend() {
    if (!input.trim() || drafting) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setDrafting(true);
    setError(null);

    try {
      const res = await fetch(`/api/calls/${props.callId}/draft-followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, currentDraft: draft }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Drafter failed");
      const data = (await res.json()) as { reply: string; draft: string };
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "Updated the draft." }]);
      if (data.draft) setDraft(data.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSendSms() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/calls/${props.callId}/send-followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setSent(data.preview as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  function formatPhone(phone: string): string {
    const d = phone.replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("1")) {
      return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
    }
    if (d.length === 10) {
      return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    return phone;
  }

  return (
    <div className="grid grid-cols-5 gap-6">
      {/* LEFT: Call context + Chat */}
      <div className="col-span-3 space-y-4">
        {/* Call context card */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            The call
          </p>
          <div className="flex items-baseline gap-3 mt-1">
            <p className="text-lg font-bold text-zinc-900">
              {props.callerName || formatPhone(props.callerPhone) || "Unknown caller"}
            </p>
            {props.callerName && props.callerPhone && (
              <p className="text-xs text-zinc-500 font-mono">{formatPhone(props.callerPhone)}</p>
            )}
            {props.callerTotalCalls != null && props.callerTotalCalls > 1 && (
              <p className="text-[11px] text-zinc-500">
                · returning caller ({props.callerTotalCalls} calls)
              </p>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {new Date(props.callCreatedAt).toLocaleString("en-US")}
            {props.callDurationSeconds ? ` · ${formatDur(props.callDurationSeconds)}` : ""}
          </p>
          {props.callSummary && (
            <div className="mt-3 pt-3 border-t border-zinc-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Vivienne's summary
              </p>
              <p className="text-sm text-zinc-700 mt-1 leading-relaxed">{props.callSummary}</p>
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden flex flex-col min-h-[480px]">
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Chat with Vivienne</h2>
            <span className="text-[11px] text-zinc-400">Drafts update on the right</span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {messages.length === 0 && !drafting && (
              <div className="text-center py-10">
                <p className="text-sm font-semibold text-zinc-700">Tell Vivienne what to offer.</p>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto leading-relaxed">
                  Try: <em>"Offer 20% off their first Botox consultation"</em> or{" "}
                  <em>"Let them know we have openings Thursday afternoon"</em>.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-amber-50 text-amber-900 border border-amber-200"
                      : "bg-zinc-50 text-zinc-800 border border-zinc-150"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {drafting && (
              <div className="flex justify-start">
                <div className="bg-zinc-50 text-zinc-500 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-sm italic">
                  Vivienne is drafting…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="border-t border-zinc-100 px-4 py-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={drafting || Boolean(sent)}
                placeholder="Tell Vivienne what to offer or change…"
                className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={drafting || !input.trim() || Boolean(sent)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-amber-400 text-amber-900 hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Draft preview + Send */}
      <div className="col-span-2 space-y-4">
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Draft SMS</h2>
            {draft && (
              <span className="text-[11px] text-zinc-500 tabular-nums">
                {draft.length} chars
              </span>
            )}
          </div>
          <div className="p-5">
            {!draft ? (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/40 p-6 text-center">
                <p className="text-sm text-zinc-500">No draft yet.</p>
                <p className="text-xs text-zinc-400 mt-1">
                  Start the conversation on the left — Vivienne will write the first version.
                </p>
              </div>
            ) : (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={Boolean(sent)}
                rows={8}
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-sm leading-relaxed focus:ring-2 focus:ring-amber-400 outline-none resize-y disabled:opacity-60"
              />
            )}
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              You can edit directly. We'll append "Reply STOP to opt out." automatically if you
              remove it.
            </p>
          </div>
        </div>

        {/* Send block */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          {sent ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-3 h-3 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-emerald-800">Sent to {formatPhone(props.callerPhone)}</p>
              </div>
              <p className="text-xs text-zinc-500 whitespace-pre-wrap leading-relaxed bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                {sent}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-600 leading-relaxed mb-3">
                When ready, send to{" "}
                <span className="font-semibold">{formatPhone(props.callerPhone) || "the caller"}</span>.
                This sends via your clinic's SMS number.
              </p>
              <button
                onClick={handleSendSms}
                disabled={!draft.trim() || sending || drafting}
                className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-amber-50 border border-amber-400 text-amber-900 hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send SMS"}
              </button>
              {error && (
                <p className="text-xs text-rose-700 mt-2 leading-relaxed">{error}</p>
              )}
            </>
          )}
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
