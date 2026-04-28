"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useDismiss } from "../_components/useDismiss";
import SyncStatusBar from "../_components/SyncStatusBar";
import { PLATFORM_COLORS } from "../_components/platforms";

interface CalEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  customer_name: string | null;
  customer_phone: string | null;
  service_type: string | null;
  status: "confirmed" | "cancelled" | "completed";
  external_source: string | null;
  external_id: string | null;
  last_synced_at: string | null;
  completed_at?: string | null;
}

const AI_COLOR = { bg: "bg-amber-100", text: "text-amber-900", label: "AI booked" };

interface IntegrationStatus {
  platform: string | null;
  status: "pending" | "connected" | "error" | "disabled";
  last_synced_at: string | null;
}

function eventColor(ev: CalEvent) {
  if (ev.external_source && PLATFORM_COLORS[ev.external_source]) {
    return PLATFORM_COLORS[ev.external_source];
  }
  return AI_COLOR;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [integration, setIntegration] = useState<IntegrationStatus | null>(null);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    fetch("/api/integrations/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setIntegration(data))
      .catch(() => {});
  }, []);

  const closeSelected = useCallback(() => setSelected(null), []);
  useDismiss(selected !== null, closeSelected);

  const applyCompletionToState = useCallback(
    (eventId: string, undo: boolean) => {
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === eventId
            ? {
                ...ev,
                status: undo ? "confirmed" : "completed",
                completed_at: undo ? null : new Date().toISOString(),
              }
            : ev
        )
      );
      setSelected((prev) =>
        prev && prev.id === eventId
          ? {
              ...prev,
              status: undo ? "confirmed" : "completed",
              completed_at: undo ? null : new Date().toISOString(),
            }
          : prev
      );
    },
    []
  );

  const markCompleted = useCallback(
    async (eventId: string, undo: boolean) => {
      setCompleting(true);
      const res = await fetch(`/api/calendar/events/${eventId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undo }),
      });
      setCompleting(false);
      if (res.ok) applyCompletionToState(eventId, undo);
    },
    [applyCompletionToState]
  );

  const loadMonth = useCallback(async (anchor: Date) => {
    setLoading(true);
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    const qs = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    const res = await fetch(`/api/calendar/events?${qs}`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMonth(cursor);
  }, [cursor, loadMonth]);

  // Group events by YYYY-MM-DD for fast cell lookup
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const ev of events) {
      const d = new Date(ev.start_time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      (map[key] ||= []).push(ev);
    }
    return map;
  }, [events]);

  // Build a 6-week grid covering the month view
  const cells = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDow = firstOfMonth.getDay(); // 0 = Sun
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - startDow);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      out.push(d);
    }
    return out;
  }, [cursor]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const currentMonth = cursor.getMonth();

  function prev() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  }
  function next() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  }
  function goToday() {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  // Derived legend — only show sources actually present this month
  const sourcesThisMonth = useMemo(() => {
    const set = new Set<string>();
    let hasAi = false;
    for (const ev of events) {
      if (ev.external_source) set.add(ev.external_source);
      else hasAi = true;
    }
    const out: { key: string; bg: string; text: string; label: string }[] = [];
    if (hasAi) out.push({ key: "ai", ...AI_COLOR });
    for (const src of set) {
      if (PLATFORM_COLORS[src]) out.push({ key: src, ...PLATFORM_COLORS[src] });
    }
    return out;
  }, [events]);

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-zinc-900 uppercase tracking-tighter">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            className="w-9 h-9 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors flex items-center justify-center"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            onClick={goToday}
            className="px-3 h-9 rounded-xl border border-zinc-200 bg-white text-zinc-700 text-xs font-bold uppercase tracking-wider hover:bg-zinc-50 transition-colors"
          >
            Today
          </button>
          <button
            onClick={next}
            className="w-9 h-9 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors flex items-center justify-center"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {/* Connect-your-platform banner — the one "night" moment on the page,
          styled after the landing's Champagne Noir hero: near-black canvas,
          warm amber glow, gold divider stroke. */}
      {integration && integration.status !== "connected" && (
        <div className="relative overflow-hidden rounded-2xl bg-zinc-950 p-8 shadow-xl">
          {/* Warm amber glows — mirrors the landing's hero ambient */}
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl" />
          <div className="absolute -left-16 -bottom-20 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl" />
          {/* Thin gold divider beneath the title — signature Aman/landing detail */}
          <div className="relative flex items-start justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <div className="inline-flex items-center gap-2 mb-4">
                <span className="w-1 h-1 rounded-full bg-amber-400" />
                <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-[0.25em]">
                  Not connected
                </span>
              </div>
              <h2 className="font-serif text-3xl text-white leading-tight tracking-tight">
                Connect your booking platform
              </h2>
              <div className="h-px w-16 bg-gradient-to-r from-amber-400 to-transparent my-4" />
              <p className="text-sm text-zinc-300 max-w-xl leading-relaxed">
                Now supporting Boulevard, Acuity, Mindbody, Square, Zenoti, Vagaro, Jane, and WellnessLiving. Contact us to integrate yours.
              </p>
            </div>
            <a
              href="mailto:founder@vauxvoice.com"
              className="inline-flex items-center gap-2 px-5 py-3 bg-white text-zinc-950 text-sm font-semibold rounded-xl hover:bg-amber-50 transition-colors shadow-sm shrink-0"
            >
              Email founder@vauxvoice.com
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </div>
        </div>
      )}

      {/* Sync status pill + Sync now button — shared across calendar, providers, clients */}
      <SyncStatusBar onSyncComplete={() => loadMonth(cursor)} />

      {/* Month header + legend */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-black text-zinc-900 tracking-tight">{monthLabel(cursor)}</h2>
        {sourcesThisMonth.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {sourcesThisMonth.map((s) => (
              <span
                key={s.key}
                className={`px-2.5 py-1 ${s.bg} ${s.text} text-[10px] font-black rounded-full uppercase tracking-wider`}
              >
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="px-3 py-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-center"
            >
              {d}
            </div>
          ))}
        </div>

        {/* 6-week grid */}
        <div className="grid grid-cols-7 grid-rows-6">
          {cells.map((d, i) => {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const dayEvents = eventsByDay[key] ?? [];
            const inMonth = d.getMonth() === currentMonth;
            const isToday = key === todayKey;
            return (
              <div
                key={i}
                className={`min-h-[112px] border-b border-r border-zinc-100 p-1.5 ${
                  inMonth ? "bg-white" : "bg-zinc-50/60"
                } ${i % 7 === 6 ? "border-r-0" : ""} ${i >= 35 ? "border-b-0" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`inline-flex items-center justify-center text-xs font-bold ${
                      isToday
                        ? "bg-white text-amber-900 border border-amber-400 shadow-sm rounded-full w-6 h-6"
                        : inMonth
                        ? "text-zinc-700 w-6 h-6"
                        : "text-zinc-300 w-6 h-6"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-zinc-400 font-bold">
                      +{dayEvents.length - 3}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((ev) => {
                    const c = eventColor(ev);
                    const cancelled = ev.status === "cancelled";
                    return (
                      <button
                        key={ev.id}
                        onClick={() => setSelected(ev)}
                        className={`w-full text-left px-2 py-1 rounded-lg ${c.bg} ${c.text} text-[11px] font-semibold truncate hover:ring-2 hover:ring-offset-1 hover:ring-amber-300 transition ${
                          cancelled ? "line-through opacity-60" : ""
                        }`}
                        title={`${formatTime(ev.start_time)} · ${ev.title}`}
                      >
                        <span className="font-mono text-[10px] opacity-70">
                          {formatTime(ev.start_time)}
                        </span>{" "}
                        {ev.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && (
        <p className="text-xs text-zinc-400 italic text-center">Loading events…</p>
      )}

      {events.length === 0 && !loading && (
        <div className="bg-white rounded-3xl border border-dashed border-zinc-200 p-10 text-center">
          <p className="text-sm font-bold text-zinc-700">No appointments for {monthLabel(cursor)}</p>
          <p className="text-xs text-zinc-500 mt-1">
            Events booked by your AI Clientele Specialist — and those synced from your connected booking platform — will appear here.
          </p>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/30 z-40 flex items-end sm:items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  {monthKey(new Date(selected.start_time))} · {new Date(selected.start_time).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </p>
                <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight mt-1">
                  {selected.title}
                </h3>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-zinc-400 hover:text-zinc-700 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 ${eventColor(selected).bg} ${eventColor(selected).text} text-[10px] font-black rounded-full uppercase tracking-wider`}>
                  {eventColor(selected).label}
                </span>
                {selected.status !== "confirmed" && (
                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-[10px] font-black rounded-full uppercase tracking-wider">
                    {selected.status}
                  </span>
                )}
              </div>

              <div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Time</p>
                <p className="text-sm font-bold text-zinc-800">
                  {formatTime(selected.start_time)} – {formatTime(selected.end_time)}
                </p>
              </div>

              {selected.customer_name && (
                <div>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Customer</p>
                  <p className="text-sm font-bold text-zinc-800">{selected.customer_name}</p>
                  {selected.customer_phone && (
                    <p className="text-xs text-zinc-500 font-mono">{selected.customer_phone}</p>
                  )}
                </div>
              )}

              {selected.service_type && (
                <div>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Service</p>
                  <p className="text-sm font-bold text-zinc-800">{selected.service_type}</p>
                </div>
              )}

              {selected.description && (
                <div>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Notes</p>
                  <p className="text-sm text-zinc-600 whitespace-pre-wrap">{selected.description}</p>
                </div>
              )}

              {selected.last_synced_at && (
                <p className="text-[10px] text-zinc-400 pt-2 border-t border-zinc-100">
                  Synced from {selected.external_source} · {new Date(selected.last_synced_at).toLocaleString()}
                </p>
              )}

              {new Date(selected.start_time).getTime() <= Date.now() && selected.status !== "cancelled" && (
                <div className="pt-3 border-t border-zinc-100">
                  {selected.status === "completed" ? (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                          Completed
                        </p>
                        <p className="text-xs text-zinc-500">
                          {selected.completed_at
                            ? new Date(selected.completed_at).toLocaleString()
                            : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => markCompleted(selected.id, true)}
                        disabled={completing}
                        className="text-xs text-zinc-500 hover:text-zinc-800 underline disabled:opacity-50"
                      >
                        Undo
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => markCompleted(selected.id, false)}
                      disabled={completing}
                      className="w-full px-4 py-2.5 bg-white text-emerald-800 border border-emerald-400 font-semibold rounded-lg hover:bg-emerald-50 transition-colors text-sm disabled:opacity-50"
                    >
                      {completing ? "Marking..." : "Mark completed"}
                    </button>
                  )}
                  <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed">
                    Marking complete triggers the post-visit aftercare SMS (if enabled and consent on file) at the tenant's configured delay.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
