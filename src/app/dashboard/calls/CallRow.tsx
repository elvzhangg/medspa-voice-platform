"use client";

import { useState, useEffect, useRef } from "react";

export interface CallFollowup {
  id: string;
  action: string;
  status: "pending" | "done";
  created_at: string;
  completed_at: string | null;
}

export interface CallLog {
  id: string;
  vapi_call_id: string;
  caller_number: string | null;
  duration_seconds: number | null;
  summary: string | null;
  transcript: string | null;
  created_at: string;
  followups: CallFollowup[];
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function CallRow({
  call,
  highlighted,
}: {
  call: CallLog;
  highlighted?: boolean;
}) {
  // Deep-link from Ask Vivienne source pills: highlighted=true auto-expands
  // the row and scrolls it into view. Brief amber glow so the eye lands on it.
  const [expanded, setExpanded] = useState(Boolean(highlighted));
  // Local mirror of the followups so the "Mark done" button reflects state
  // immediately without waiting for a page reload.
  const [followups, setFollowups] = useState<CallFollowup[]>(call.followups);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const rowRef = useRef<HTMLTableRowElement | null>(null);

  const pendingCount = followups.filter((f) => f.status === "pending").length;

  async function markDone(id: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/calls/followups/${id}/done`, { method: "POST" });
      if (res.ok) {
        setFollowups((list) =>
          list.map((f) =>
            f.id === id ? { ...f, status: "done" as const, completed_at: new Date().toISOString() } : f
          )
        );
      }
    } finally {
      setUpdatingId(null);
    }
  }

  useEffect(() => {
    if (!highlighted) return;
    rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  return (
    <>
      <tr
        ref={rowRef}
        id={`call-${call.id}`}
        className={`border-b border-zinc-50 hover:bg-zinc-50 cursor-pointer transition-colors ${
          highlighted ? "bg-[#fdf9ec] ring-2 ring-amber-300 ring-inset" : ""
        }`}
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#fdf9ec] rounded-full flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <span className="font-medium text-zinc-900">
              {call.caller_number || (
                <span className="text-zinc-400 font-normal">Unknown</span>
              )}
            </span>
          </div>
        </td>
        <td className="px-5 py-3.5 text-zinc-600 tabular-nums font-medium">
          {formatDuration(call.duration_seconds)}
        </td>
        <td className="px-5 py-3.5 text-zinc-500 max-w-xs">
          <div className="flex items-center gap-2">
            <p className="truncate flex-1">
              {call.summary || <span className="text-zinc-300">No summary</span>}
            </p>
            {pendingCount > 0 && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {pendingCount} task{pendingCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </td>
        <td className="px-5 py-3.5 text-zinc-500 whitespace-nowrap">
          {new Date(call.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}{" "}
          <span className="text-zinc-400">
            {new Date(call.created_at).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </td>
        <td className="px-5 py-3.5 text-right">
          <svg
            className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-[#fdf9ec]/60 border-b border-amber-200">
          <td colSpan={5} className="px-5 py-5">
            <div className="space-y-4 max-w-3xl">
              {followups.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                    Follow-up tasks
                  </p>
                  <ul className="space-y-1.5">
                    {followups.map((f) => (
                      <li
                        key={f.id}
                        className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${
                          f.status === "done"
                            ? "border-zinc-200 bg-white text-zinc-400 line-through"
                            : "border-amber-200 bg-white text-zinc-800"
                        }`}
                      >
                        <span className="flex-1">{f.action}</span>
                        {f.status === "pending" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              markDone(f.id);
                            }}
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
                </div>
              )}
              {call.summary && (
                <div>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                    Summary
                  </p>
                  <p className="text-sm text-zinc-700 leading-relaxed">{call.summary}</p>
                </div>
              )}
              {call.transcript && (
                <div>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                    Transcript
                  </p>
                  <pre className="text-xs text-zinc-600 whitespace-pre-wrap bg-white rounded-lg border border-amber-200 p-4 max-h-52 overflow-y-auto font-sans leading-relaxed">
                    {call.transcript}
                  </pre>
                </div>
              )}
              {!call.summary && !call.transcript && (
                <p className="text-sm text-zinc-400">No details available for this call.</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
