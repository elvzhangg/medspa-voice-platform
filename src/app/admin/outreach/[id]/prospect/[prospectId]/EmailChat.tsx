"use client";

import { useEffect, useRef, useState } from "react";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export default function EmailChat({
  prospectId,
  open,
  currentSubject,
  currentBody,
  onClose,
  onDataChanged,
}: {
  prospectId: string;
  open: boolean;
  currentSubject: string | null;
  currentBody: string | null;
  onClose: () => void;
  onDataChanged: () => void;
}) {
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // Local copies of the draft that update from each response — lets the
  // preview pane stay in sync without waiting for the parent's refetch.
  const [subject, setSubject] = useState<string | null>(currentSubject);
  const [body, setBody] = useState<string | null>(currentBody);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSubject(currentSubject);
      setBody(currentBody);
    }
  }, [open, currentSubject, currentBody]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const userTurn: ChatTurn = { role: "user", content: text, ts: Date.now() };
    const nextHistory = [...history, userTurn];
    setHistory(nextHistory);
    setInput("");

    try {
      const res = await fetch("/api/admin/agent/email-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospect_id: prospectId,
          message: text,
          history: history.map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHistory([...nextHistory, { role: "assistant", content: `⚠️ ${data.error ?? "Request failed"}`, ts: Date.now() }]);
        return;
      }
      setHistory([...nextHistory, { role: "assistant", content: data.reply || "(updated)", ts: Date.now() }]);
      setSubject(data.subject ?? subject);
      setBody(data.body ?? body);
      if (data.changed) onDataChanged();
    } catch (err) {
      setHistory([...nextHistory, { role: "assistant", content: `⚠️ ${(err as Error).message}`, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Email editor</p>
            <h2 className="font-semibold text-gray-900">Chat to revise the draft</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="flex-1 grid grid-cols-2 min-h-0">
          {/* Chat column */}
          <div className="flex flex-col border-r border-gray-100 min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {history.length === 0 && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-3 border border-gray-100">
                  <p className="font-medium text-gray-700 mb-1">How to use this</p>
                  <p>Tell the editor what to change. Examples:</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>&ldquo;Make it shorter — under 100 words.&rdquo;</li>
                    <li>&ldquo;Lead with the Botox volume detail.&rdquo;</li>
                    <li>&ldquo;Soften the second CTA, more curious less salesy.&rdquo;</li>
                    <li>&ldquo;Mention they use Boulevard specifically.&rdquo;</li>
                  </ul>
                </div>
              )}
              {history.map((turn, i) => (
                <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                      turn.role === "user"
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {turn.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-500 rounded-2xl px-3.5 py-2 text-sm italic">Editing…</div>
                </div>
              )}
              <div ref={endRef} />
            </div>
            <form onSubmit={send} className="border-t border-gray-100 p-3 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tell the editor what to change…"
                disabled={sending}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                autoFocus
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </div>

          {/* Live draft preview */}
          <div className="flex flex-col bg-gray-50 min-h-0">
            <div className="px-5 py-3 border-b border-gray-100 bg-white">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Subject</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{subject ?? <span className="text-gray-400 italic">No draft yet</span>}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {body ? (
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{body}</pre>
              ) : (
                <p className="text-sm text-gray-400 italic">Ask the editor to write a first draft — e.g. &ldquo;Draft a first version focusing on after-hours missed calls.&rdquo;</p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-white text-xs text-gray-500">
              Revisions are saved automatically. Approve back on the main page when you&apos;re happy.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
