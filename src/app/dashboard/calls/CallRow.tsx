"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

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
  brandPrefix,
}: {
  call: CallLog;
  highlighted?: boolean;
  brandPrefix: string;
}) {
  const router = useRouter();
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const pendingCount = call.followups.filter((f) => f.status === "pending").length;
  const detailHref = `${brandPrefix}/dashboard/calls/${call.id}`;

  useEffect(() => {
    if (!highlighted) return;
    rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  return (
    <tr
      ref={rowRef}
      id={`call-${call.id}`}
      className={`border-b border-zinc-50 hover:bg-zinc-50 cursor-pointer transition-colors ${
        highlighted ? "bg-[#fdf9ec] ring-2 ring-amber-300 ring-inset" : ""
      }`}
      onClick={() => router.push(detailHref)}
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#fdf9ec] rounded-full flex items-center justify-center shrink-0">
            <svg
              className="w-3 h-3 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
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
          className="w-3.5 h-3.5 text-zinc-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </td>
    </tr>
  );
}
