"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface TaskRow {
  id: string;
  action: string;
  status: "pending" | "done";
  source: "live" | "chat" | "backfill" | "manual";
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  completed_at: string | null;
  call_log_id: string | null;
}

interface Props {
  tasks: TaskRow[];
  brandPrefix: string;
  statusFilter: "pending" | "done" | "all";
  sourceFilter: "live" | "chat" | "backfill" | "manual" | "all";
  pendingCount: number;
  doneCount: number;
}

const STATUS_TABS: Array<{ key: Props["statusFilter"]; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

const SOURCE_OPTIONS: Array<{ key: Props["sourceFilter"]; label: string }> = [
  { key: "all", label: "All sources" },
  { key: "live", label: "Live calls" },
  { key: "chat", label: "Chat" },
  { key: "backfill", label: "Backfill" },
  { key: "manual", label: "Manual" },
];

const SOURCE_BADGE: Record<TaskRow["source"], { label: string; className: string }> = {
  live: { label: "Live call", className: "bg-amber-50 text-amber-800 border-amber-200" },
  chat: { label: "From chat", className: "bg-violet-50 text-violet-800 border-violet-200" },
  backfill: { label: "Backfill", className: "bg-zinc-50 text-zinc-700 border-zinc-200" },
  manual: { label: "Manual", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

export default function TasksList({
  tasks: initialTasks,
  brandPrefix,
  statusFilter,
  sourceFilter,
  pendingCount,
  doneCount,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  async function scanPastCalls() {
    if (scanning) return;
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/calls/backfill-followups", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setScanResult(data.error ?? "Scan failed");
      } else {
        const created = data.tasks_created ?? 0;
        const processed = data.processed ?? 0;
        if (created > 0) {
          setScanResult(`Found ${created} task${created === 1 ? "" : "s"} across ${processed} call${processed === 1 ? "" : "s"}.`);
          startTransition(() => router.refresh());
        } else {
          setScanResult(`Scanned ${processed} call${processed === 1 ? "" : "s"} — no new tasks found.`);
        }
      }
    } catch {
      setScanResult("Scan failed. Try again in a moment.");
    } finally {
      setScanning(false);
    }
  }

  function buildHref(next: { status?: Props["statusFilter"]; source?: Props["sourceFilter"] }) {
    const params = new URLSearchParams();
    const s = next.status ?? statusFilter;
    const src = next.source ?? sourceFilter;
    if (s !== "pending") params.set("status", s);
    if (src !== "all") params.set("source", src);
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  }

  async function markDone(id: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/calls/followups/${id}/done`, { method: "POST" });
      if (res.ok) {
        setTasks((list) =>
          list.map((t) =>
            t.id === id
              ? { ...t, status: "done" as const, completed_at: new Date().toISOString() }
              : t
          )
        );
        startTransition(() => router.refresh());
      }
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
          {STATUS_TABS.map((tab) => {
            const active = tab.key === statusFilter;
            const count =
              tab.key === "pending" ? pendingCount : tab.key === "done" ? doneCount : undefined;
            return (
              <Link
                key={tab.key}
                href={buildHref({ status: tab.key })}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  active
                    ? "bg-amber-50 text-amber-900 border border-amber-300"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {tab.label}
                {count != null && (
                  <span className="ml-1.5 text-zinc-400 font-normal">({count})</span>
                )}
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={scanPastCalls}
          disabled={scanning}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors disabled:opacity-50"
          title="Have Vivienne re-read past call transcripts and pull out any follow-ups she missed"
        >
          {scanning ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Scanning past calls…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Scan past calls
            </>
          )}
        </button>
      </div>

      {scanResult && (
        <p className="mb-3 text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
          {scanResult}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-zinc-200 bg-white overflow-hidden">
          {SOURCE_OPTIONS.map((opt) => {
            const active = opt.key === sourceFilter;
            return (
              <Link
                key={opt.key}
                href={buildHref({ source: opt.key })}
                className={`px-2.5 py-1.5 text-[11px] font-medium border-r last:border-r-0 border-zinc-100 transition-colors ${
                  active ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 text-center py-16">
          <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-zinc-700 mb-1">
            {statusFilter === "pending" ? "No pending tasks" : "No tasks match these filters"}
          </h3>
          <p className="text-sm text-zinc-400">
            Tasks appear here whenever Vivienne commits to a follow-up.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <ul className="divide-y divide-zinc-100">
            {tasks.map((t) => (
              <li
                key={t.id}
                className={`flex items-start gap-3 px-5 py-3.5 ${
                  t.status === "done" ? "bg-zinc-50/50" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        SOURCE_BADGE[t.source].className
                      }`}
                    >
                      {SOURCE_BADGE[t.source].label}
                    </span>
                    {t.customer_name && (
                      <span className="text-xs font-semibold text-zinc-700">
                        {t.customer_name}
                      </span>
                    )}
                    {t.customer_phone && (
                      <span className="text-xs text-zinc-400 font-mono">
                        {t.customer_phone}
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">
                      {new Date(t.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <p
                    className={`text-sm leading-relaxed ${
                      t.status === "done" ? "text-zinc-400 line-through" : "text-zinc-800"
                    }`}
                  >
                    {t.action}
                  </p>
                  {t.call_log_id && (
                    <Link
                      href={`${brandPrefix}/dashboard/calls/${t.call_log_id}`}
                      className="inline-block mt-1 text-[11px] font-medium text-amber-700 hover:text-amber-900"
                    >
                      View call →
                    </Link>
                  )}
                </div>
                <div className="shrink-0">
                  {t.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => markDone(t.id)}
                      disabled={updatingId === t.id}
                      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
                    >
                      {updatingId === t.id ? "…" : "Mark done"}
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                      Done
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
