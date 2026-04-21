"use client";

import { useState } from "react";

export interface CallLog {
  id: string;
  caller_number: string | null;
  duration_seconds: number | null;
  summary: string | null;
  transcript: string | null;
  created_at: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function CallRow({ call }: { call: CallLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-zinc-50 hover:bg-zinc-50 cursor-pointer transition-colors"
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
          <p className="truncate">
            {call.summary || <span className="text-zinc-300">No summary</span>}
          </p>
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
