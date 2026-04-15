"use client";

import { useState, useEffect } from "react";

interface CallLog {
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

export default function CallLogsPage() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCalls() {
      const res = await fetch("/api/calls/me");
      if (res.ok) {
        const data = await res.json();
        setCalls(data.calls || []);
      }
      setLoading(false);
    }
    fetchCalls();
  }, []);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Call Logs</h1>
        <p className="text-sm text-gray-500">Recent calls handled by your AI receptionist</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : calls.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 text-center py-20">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">No calls yet</h3>
          <p className="text-sm text-gray-400">
            Once your number is active, calls will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Caller
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Summary
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Date &amp; Time
                </th>
                <th className="px-5 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <>
                  <tr
                    key={call.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => toggleExpand(call.id)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </div>
                        <span className="font-medium text-gray-900">
                          {call.caller_number || (
                            <span className="text-gray-400 font-normal">Unknown</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 tabular-nums font-medium">
                      {formatDuration(call.duration_seconds)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 max-w-xs">
                      <p className="truncate">
                        {call.summary || <span className="text-gray-300">No summary</span>}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                      {new Date(call.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      <span className="text-gray-400">
                        {new Date(call.created_at).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <svg
                        className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expandedId === call.id ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </td>
                  </tr>
                  {expandedId === call.id && (
                    <tr key={`${call.id}-expanded`} className="bg-indigo-50/60 border-b border-indigo-100">
                      <td colSpan={5} className="px-5 py-5">
                        <div className="space-y-4 max-w-3xl">
                          {call.summary && (
                            <div>
                              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                                Summary
                              </p>
                              <p className="text-sm text-gray-700 leading-relaxed">{call.summary}</p>
                            </div>
                          )}
                          {call.transcript && (
                            <div>
                              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                                Transcript
                              </p>
                              <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-white rounded-lg border border-indigo-100 p-4 max-h-52 overflow-y-auto font-sans leading-relaxed">
                                {call.transcript}
                              </pre>
                            </div>
                          )}
                          {!call.summary && !call.transcript && (
                            <p className="text-sm text-gray-400">No details available for this call.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
