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

type ViewMode = "month" | "week" | "day";

// Time-grid bounds used by week + day views. Wide enough to cover early
// setup blocks (7am) through late evening events (10pm-ish), so an event
// at 8:30pm with the default 1-hour duration still fits inside the grid
// without spilling past the bottom row. Anything beyond this range is
// clamped, but the grid itself is wrapped in a scrollable container so
// extending the range doesn't blow up the page height.
const HOUR_GRID_START = 7;
const HOUR_GRID_END = 23; // exclusive — last labeled row is 10 PM
const HOUR_ROW_PX = 56;
// Max height of the scrollable time-grid viewport. Keeps the calendar
// card from pushing the footer way down on tall screens; users can
// scroll within the grid to see early-morning or late-night slots.
const TIME_GRID_MAX_HEIGHT = "calc(100vh - 320px)";

interface IntegrationStatus {
  platform: string | null;
  status: "pending" | "connected" | "error" | "disabled";
  last_synced_at: string | null;
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "amber" | "zinc" | "rose";
}) {
  // Accent classes are split out as a small map rather than interpolated
  // into the className string — Tailwind's JIT only includes classes it
  // sees as literal substrings, so dynamic concatenation gets purged.
  const accentClasses: Record<typeof accent, string> = {
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    zinc: "text-zinc-700 bg-white border-zinc-200",
    rose: "text-rose-700 bg-rose-50 border-rose-200",
  };
  return (
    <div className={`px-4 py-3 rounded-2xl border ${accentClasses[accent]}`}>
      <div className="text-[10px] font-black uppercase tracking-widest opacity-70">
        {label}
      </div>
      <div className="text-2xl font-black tracking-tight mt-0.5">{value}</div>
    </div>
  );
}

function eventColor(ev: CalEvent) {
  if (ev.external_source && PLATFORM_COLORS[ev.external_source]) {
    return PLATFORM_COLORS[ev.external_source];
  }
  return AI_COLOR;
}

// Uniform "Service · Customer" label so AI-booked, platform-synced, and
// manual events read the same on the grid. Falls back to whichever side is
// present, then finally to the raw title (which upstream sources set
// inconsistently — Boulevard uses appointment titles, Vivienne uses the
// service name, etc.).
function eventLabel(ev: Pick<CalEvent, "title" | "service_type" | "customer_name">): string {
  const service = ev.service_type?.trim();
  const customer = ev.customer_name?.trim();
  if (service && customer) return `${service} · ${customer}`;
  if (service) return service;
  if (customer) return customer;
  return ev.title;
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

// "May 3 – 9, 2026" for the displayed week. Always starts on Sunday to
// match the existing month grid's day-of-week header order.
function weekLabel(anchor: Date) {
  const start = startOfWeek(anchor);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.toLocaleDateString("en-US", { month: "long" })} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  if (sameYear) {
    return `${start.toLocaleDateString("en-US", { month: "short" })} ${start.getDate()} – ${end.toLocaleDateString("en-US", { month: "short" })} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function dayLabel(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Map an event's start time to a fractional hour offset within the
// HOUR_GRID_START–HOUR_GRID_END window. Used to position events
// vertically in the time grid. Clamps so events at 6am don't render
// at -1, and 11pm events don't overflow below.
function hourFraction(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

// Pixel offset from the top of the time grid for an event start time.
function topPxForTime(iso: string): number {
  const h = hourFraction(iso);
  const clamped = Math.max(HOUR_GRID_START, Math.min(HOUR_GRID_END, h));
  return (clamped - HOUR_GRID_START) * HOUR_ROW_PX;
}

// Height in px for an event spanning start → end. Falls back to a 60-min
// default block if endTime is missing or non-positive (defensive).
function heightPxForRange(startIso: string, endIso: string | null | undefined): number {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : start + 60 * 60 * 1000;
  const minutes = Math.max(15, (end - start) / 60_000);
  return (minutes / 60) * HOUR_ROW_PX;
}

export default function CalendarPage() {
  // Cursor is interpreted differently by each view (any-day-in-month for
  // month view; any-day-in-week for week view; the day itself for day view),
  // so we initialize to today. This way week view lands on the *current*
  // week — not the week containing the 1st of the current month, which
  // could be the previous calendar week.
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
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

  // Compute the date range for fetching events based on the current view.
  // Month view always grabs the full 6-week grid (so days from prev/next
  // month also render); week and day views grab tight windows.
  const dateRange = useMemo(() => {
    if (viewMode === "month") {
      // Cover the full visible 6-week grid, not just the calendar month —
      // events from prev/next month days that appear in the grid would
      // otherwise be missing.
      const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const gridStart = startOfWeek(firstOfMonth);
      const gridEnd = new Date(gridStart);
      gridEnd.setDate(gridStart.getDate() + 42);
      return { start: gridStart, end: gridEnd };
    }
    if (viewMode === "week") {
      const start = startOfWeek(cursor);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return { start, end };
    }
    // day
    const start = startOfDay(cursor);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { start, end };
  }, [cursor, viewMode]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    });
    const res = await fetch(`/api/calendar/events?${qs}`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events ?? []);
    }
    setLoading(false);
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // After the initial load, give the background sync triggered by
  // /api/integrations/me a few seconds to run, then refetch. Without this,
  // a stale-data page load sees the OLD calendar_events and the user thinks
  // sync didn't work — even though the sync IS running and completes ~5s
  // after page mount. One extra fetch at +6s catches the new rows without
  // requiring a manual refresh.
  useEffect(() => {
    const t = setTimeout(() => {
      loadEvents();
    }, 6000);
    return () => clearTimeout(t);
  }, [loadEvents]);

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
    if (viewMode === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    } else if (viewMode === "week") {
      const d = new Date(cursor);
      d.setDate(d.getDate() - 7);
      setCursor(d);
    } else {
      const d = new Date(cursor);
      d.setDate(d.getDate() - 1);
      setCursor(d);
    }
  }
  function next() {
    if (viewMode === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    } else if (viewMode === "week") {
      const d = new Date(cursor);
      d.setDate(d.getDate() + 7);
      setCursor(d);
    } else {
      const d = new Date(cursor);
      d.setDate(d.getDate() + 1);
      setCursor(d);
    }
  }
  function goToday() {
    const now = new Date();
    setCursor(now);
  }

  // Stats bar — counts shown above the grid regardless of view mode.
  // Computed from the events array (which already covers the active
  // window, with month view loading 6 weeks for context).
  const stats = useMemo(() => {
    const now = new Date();
    const todayK = dayKey(now);
    const weekStart = startOfWeek(now).getTime();
    const weekEnd = weekStart + 7 * 86_400_000;

    let todayCount = 0;
    let thisWeekCount = 0;
    let aiBookedCount = 0;
    let cancelledCount = 0;
    for (const ev of events) {
      const t = new Date(ev.start_time).getTime();
      const k = dayKey(new Date(ev.start_time));
      if (k === todayK && ev.status !== "cancelled") todayCount++;
      if (t >= weekStart && t < weekEnd && ev.status !== "cancelled") thisWeekCount++;
      if (!ev.external_source && ev.status !== "cancelled") aiBookedCount++;
      if (ev.status === "cancelled") cancelledCount++;
    }
    return { todayCount, thisWeekCount, aiBookedCount, cancelledCount };
  }, [events]);

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
        <div className="flex items-center gap-2 flex-wrap">
          {/* View-mode segmented control: Month / Week / Day */}
          <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-0.5">
            {(["month", "week", "day"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 h-8 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  viewMode === m
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={prev}
            className="w-9 h-9 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors flex items-center justify-center"
            aria-label={`Previous ${viewMode}`}
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
            aria-label={`Next ${viewMode}`}
          >
            ›
          </button>
        </div>
      </div>

      {/* Stats bar — same data across all view modes; pulled from the
          currently-loaded events window. todayCount/thisWeekCount are
          based on actual today, not the cursor, so they're a stable "what's
          on the schedule" snapshot regardless of which month/week the user
          is browsing. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Today" value={stats.todayCount} accent="amber" />
        <StatCard label="This week" value={stats.thisWeekCount} accent="zinc" />
        <StatCard label="AI booked" value={stats.aiBookedCount} accent="zinc" />
        <StatCard label="Cancelled" value={stats.cancelledCount} accent="rose" />
      </div>

      {/* Connect-your-Google-Calendar banner — the one "night" moment on the
          page, styled after the landing's Champagne Noir hero: near-black
          canvas, warm amber glow, gold divider stroke. Pitches the GCal
          three-way sync as the universal connector. */}
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
                Connect your Google Calendar
              </h2>
              <div className="h-px w-16 bg-gradient-to-r from-amber-400 to-transparent my-4" />
              <p className="text-sm text-zinc-300 max-w-xl leading-relaxed">
                Real-time three-way sync between your AI receptionist, your Google
                Calendar, and your booking platform &mdash; Boulevard, Acuity,
                Mindbody, Square, Zenoti, Vagaro, Jane, WellnessLiving, and more.
              </p>
            </div>
            <a
              href="/api/google/start"
              className="inline-flex items-center gap-2 px-5 py-3 bg-white text-zinc-950 text-sm font-semibold rounded-xl hover:bg-amber-50 transition-colors shadow-sm shrink-0"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                />
              </svg>
              Connect with Google
            </a>
          </div>
        </div>
      )}

      {/* Sync status pill + Sync now button — shared across calendar, providers, clients */}
      <SyncStatusBar onSyncComplete={loadEvents} />

      {/* Title + legend — title text adapts per view mode */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-black text-zinc-900 tracking-tight">
          {viewMode === "month"
            ? monthLabel(cursor)
            : viewMode === "week"
            ? weekLabel(cursor)
            : dayLabel(cursor)}
        </h2>
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

      {/* Grid — month / week / day each render their own layout. */}
      {viewMode === "month" && (
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
                        title={`${formatTime(ev.start_time)} · ${eventLabel(ev)}`}
                      >
                        <span className="font-mono text-[10px] opacity-70">
                          {formatTime(ev.start_time)}
                        </span>{" "}
                        {eventLabel(ev)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      )}

      {/* WEEK VIEW — 7 day columns × hourly rows */}
      {viewMode === "week" && (
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          {/* Day-of-week header with date numbers */}
          <div
            className="grid border-b border-zinc-100 bg-zinc-50"
            style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
          >
            <div /> {/* corner spacer above hour labels */}
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date(startOfWeek(cursor));
              d.setDate(d.getDate() + i);
              const isToday = dayKey(d) === todayKey;
              return (
                <div
                  key={i}
                  className={`px-3 py-2 text-center border-l border-zinc-100 ${
                    isToday ? "bg-amber-50" : ""
                  }`}
                >
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div
                    className={`mt-0.5 text-sm font-bold ${
                      isToday ? "text-amber-900" : "text-zinc-700"
                    }`}
                  >
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Time grid — wrapped in a scrollable container so events at
              any hour stay visible without bloating the page height. */}
          <div
            className="overflow-y-auto"
            style={{ maxHeight: TIME_GRID_MAX_HEIGHT }}
          >
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: "60px repeat(7, 1fr)",
              height: `${(HOUR_GRID_END - HOUR_GRID_START) * HOUR_ROW_PX}px`,
            }}
          >
            {/* Hour labels column */}
            <div className="border-r border-zinc-100">
              {Array.from(
                { length: HOUR_GRID_END - HOUR_GRID_START },
                (_, i) => HOUR_GRID_START + i
              ).map((h) => (
                <div
                  key={h}
                  className="text-right pr-2 text-[10px] text-zinc-400 font-mono border-b border-zinc-50"
                  style={{ height: HOUR_ROW_PX }}
                >
                  {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
                </div>
              ))}
            </div>
            {/* Day columns with absolute-positioned events */}
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date(startOfWeek(cursor));
              d.setDate(d.getDate() + i);
              const k = dayKey(d);
              const dayEvents = eventsByDay[k] ?? [];
              const isToday = k === todayKey;
              return (
                <div
                  key={i}
                  className={`relative border-l border-zinc-100 ${
                    isToday ? "bg-amber-50/30" : ""
                  }`}
                >
                  {/* Hour grid lines */}
                  {Array.from(
                    { length: HOUR_GRID_END - HOUR_GRID_START },
                    (_, h) => h
                  ).map((h) => (
                    <div
                      key={h}
                      className="border-b border-zinc-50"
                      style={{ height: HOUR_ROW_PX }}
                    />
                  ))}
                  {/* Events */}
                  {dayEvents.map((ev) => {
                    const c = eventColor(ev);
                    const cancelled = ev.status === "cancelled";
                    return (
                      <button
                        key={ev.id}
                        onClick={() => setSelected(ev)}
                        className={`absolute left-1 right-1 px-2 py-1 rounded-lg ${c.bg} ${c.text} text-[11px] font-semibold text-left overflow-hidden hover:ring-2 hover:ring-offset-1 hover:ring-amber-300 transition ${
                          cancelled ? "line-through opacity-60" : ""
                        }`}
                        style={{
                          top: topPxForTime(ev.start_time),
                          height: heightPxForRange(ev.start_time, ev.end_time),
                        }}
                        title={`${formatTime(ev.start_time)} · ${eventLabel(ev)}`}
                      >
                        <div className="font-mono text-[10px] opacity-70">
                          {formatTime(ev.start_time)}
                        </div>
                        <div className="truncate">{eventLabel(ev)}</div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* DAY VIEW — single-day timeline, more vertical room per event */}
      {viewMode === "day" && (
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div
            className="overflow-y-auto"
            style={{ maxHeight: TIME_GRID_MAX_HEIGHT }}
          >
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: "70px 1fr",
              height: `${(HOUR_GRID_END - HOUR_GRID_START) * HOUR_ROW_PX}px`,
            }}
          >
            {/* Hour labels */}
            <div className="border-r border-zinc-100">
              {Array.from(
                { length: HOUR_GRID_END - HOUR_GRID_START },
                (_, i) => HOUR_GRID_START + i
              ).map((h) => (
                <div
                  key={h}
                  className="text-right pr-2 text-[11px] text-zinc-400 font-mono border-b border-zinc-50 pt-1"
                  style={{ height: HOUR_ROW_PX }}
                >
                  {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
                </div>
              ))}
            </div>
            {/* Events column */}
            <div className="relative">
              {Array.from(
                { length: HOUR_GRID_END - HOUR_GRID_START },
                (_, h) => h
              ).map((h) => (
                <div
                  key={h}
                  className="border-b border-zinc-50"
                  style={{ height: HOUR_ROW_PX }}
                />
              ))}
              {(eventsByDay[dayKey(cursor)] ?? []).map((ev) => {
                const c = eventColor(ev);
                const cancelled = ev.status === "cancelled";
                return (
                  <button
                    key={ev.id}
                    onClick={() => setSelected(ev)}
                    className={`absolute left-2 right-2 px-3 py-2 rounded-lg ${c.bg} ${c.text} text-sm font-semibold text-left overflow-hidden hover:ring-2 hover:ring-offset-1 hover:ring-amber-300 transition ${
                      cancelled ? "line-through opacity-60" : ""
                    }`}
                    style={{
                      top: topPxForTime(ev.start_time),
                      height: heightPxForRange(ev.start_time, ev.end_time),
                    }}
                  >
                    <div className="font-mono text-xs opacity-70">
                      {formatTime(ev.start_time)}
                      {ev.end_time ? ` – ${formatTime(ev.end_time)}` : ""}
                    </div>
                    <div className="truncate">{eventLabel(ev)}</div>
                  </button>
                );
              })}
            </div>
          </div>
          </div>
        </div>
      )}

      {loading && (
        <p className="text-xs text-zinc-400 italic text-center">Loading events…</p>
      )}

      {events.length === 0 && !loading && (
        <div className="bg-white rounded-3xl border border-dashed border-zinc-200 p-10 text-center">
          <p className="text-sm font-bold text-zinc-700">
            No appointments for{" "}
            {viewMode === "month"
              ? monthLabel(cursor)
              : viewMode === "week"
              ? weekLabel(cursor)
              : dayLabel(cursor)}
          </p>
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
                  {eventLabel(selected)}
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
