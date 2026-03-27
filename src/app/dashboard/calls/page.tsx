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
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Call Logs</h1>
      <p className="text-gray-500 mb-8 text-sm">Recent calls handled by your AI receptionist</p>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : calls.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">📞</p>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No calls yet</h3>
          <p className="text-gray-400 text-sm">
            Once your number is active, calls will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Caller
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Duration
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Summary
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Date &amp; Time
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <>
                  <tr
                    key={call.id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => toggleExpand(call.id)}
                  >
                    <td className="px-5 py-3.5 font-medium text-gray-900">
                      {call.caller_number || (
                        <span className="text-gray-400">Unknown</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 tabular-nums">
                      {formatDuration(call.duration_seconds)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 max-w-xs">
                      <p className="truncate">
                        {call.summary || <span className="text-gray-400">No summary</span>}
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
                      <span className="text-gray-400 text-xs">
                        {expandedId === call.id ? "▲" : "▼"}
                      </span>
                    </td>
                  </tr>
                  {expandedId === call.id && (
                    <tr key={`${call.id}-expanded`} className="bg-indigo-50 border-b border-indigo-100">
                      <td colSpan={5} className="px-5 py-4">
                        <div className="space-y-3">
                          {call.summary && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                Summary
                              </p>
                              <p className="text-sm text-gray-700">{call.summary}</p>
                            </div>
                          )}
                          {call.transcript && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                Transcript
                              </p>
                              <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-white rounded-lg border border-gray-200 p-3 max-h-48 overflow-y-auto font-sans">
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
