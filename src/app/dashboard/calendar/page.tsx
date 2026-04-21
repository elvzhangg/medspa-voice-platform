"use client";

import { useState, useEffect, useCallback, useMemo } from"react";
import { useDismiss } from"../_components/useDismiss";

interface CalEvent {
 id: string;
 title: string;
 description: string | null;
 start_time: string;
 end_time: string;
 customer_name: string | null;
 customer_phone: string | null;
 service_type: string | null;
 status:"confirmed" |"cancelled" |"completed";
 external_source: string | null;
 external_id: string | null;
 last_synced_at: string | null;
}

const PLATFORM_COLORS: Record<string, { bg: string; text: string; label: string }> = {
 boulevard: { bg:"bg-rose-100", text:"text-rose-800", label:"Boulevard" },
 acuity: { bg:"bg-gray-900", text:"text-white", label:"Acuity" },
 mindbody: { bg:"bg-sky-100", text:"text-sky-800", label:"Mindbody" },
 square: { bg:"bg-emerald-100", text:"text-emerald-800", label:"Square" },
 zenoti: { bg:"bg-amber-100", text:"text-amber-800", label:"Zenoti" },
 vagaro: { bg:"bg-orange-100", text:"text-orange-800", label:"Vagaro" },
 jane: { bg:"bg-teal-100", text:"text-teal-800", label:"Jane" },
 wellnessliving: { bg:"bg-lime-100", text:"text-lime-800", label:"WellnessLiving" },
};
const AI_COLOR = { bg:"bg-amber-100", text:"text-amber-900", label:"AI booked" };

interface IntegrationStatus {
 platform: string | null;
 status:"pending" |"connected" |"error" |"disabled";
 last_synced_at: string | null;
}

function formatSyncAgo(iso: string | null): string {
 if (!iso) return"awaiting first sync";
 const diffMs = Date.now() - new Date(iso).getTime();
 const mins = Math.floor(diffMs / 60_000);
 if (mins < 1) return"synced just now";
 if (mins < 60) return `synced ${mins} min ago`;
 const hrs = Math.floor(mins / 60);
 if (hrs < 24) return `synced ${hrs}h ago`;
 const days = Math.floor(hrs / 24);
 return `synced ${days}d ago`;
}

function eventColor(ev: CalEvent) {
 if (ev.external_source && PLATFORM_COLORS[ev.external_source]) {
 return PLATFORM_COLORS[ev.external_source];
 }
 return AI_COLOR;
}

function monthKey(d: Date) {
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}`;
}

function formatTime(iso: string) {
 return new Date(iso).toLocaleTimeString("en-US", {
 hour:"numeric",
 minute:"2-digit",
 hour12: true,
 });
}

function monthLabel(d: Date) {
 return d.toLocaleDateString("en-US", { month:"long", year:"numeric" });
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

 useEffect(() => {
 fetch("/api/integrations/me")
 .then((r) => (r.ok ? r.json() : null))
 .then((data) => data && setIntegration(data))
 .catch(() => {});
 }, []);

 const closeSelected = useCallback(() => setSelected(null), []);
 useDismiss(selected !== null, closeSelected);

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
 const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
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
 const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
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
 if (hasAi) out.push({ key:"ai", ...AI_COLOR });
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
 <h1 className="text-2xl font-semibold text-gray-900">Calendar</h1>
 </div>
 <div className="flex items-center gap-2">
 <button
 onClick={prev}
 className="w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center"
 aria-label="Previous month"
 >
 ‹
 </button>
 <button
 onClick={goToday}
 className="px-3 h-9 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors"
 >
 Today
 </button>
 <button
 onClick={next}
 className="w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center"
 aria-label="Next month"
 >
 ›
 </button>
 </div>
 </div>

 {/* Connect-your-platform banner — prominent CTA when no integration is connected */}
 {integration && integration.status !=="connected" && (
 <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-white to-amber-100 p-8 shadow-lg">
 <div className="absolute -right-12 -top-12 w-48 h-48 bg-white/10 rounded-full blur-2xl" />
 <div className="absolute -left-8 -bottom-16 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
 <div className="relative flex items-start justify-between gap-6 flex-wrap">
 <div className="flex-1 min-w-[260px]">
 <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full mb-3">
 <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
 <span className="text-xs font-semibold text-white">
 Not connected
 </span>
 </div>
 <h2 className="text-2xl font-semibold text-white leading-tight">
 Connect your booking platform
 </h2>
 <p className="text-sm text-white/80 mt-2 max-w-xl leading-relaxed">
 Now supporting Boulevard, Acuity, Mindbody, Square, Zenoti, Vagaro, Jane, and WellnessLiving. Contact us to integrate yours.
 </p>
 </div>
 <a
 href="mailto:founder@vauxvoice.com"
 className="inline-flex items-center gap-2 px-5 py-3 bg-white text-amber-800 text-sm font-semibold rounded-2xl hover:bg-amber-50 transition-colors shadow-sm shrink-0"
 >
 Email founder@vauxvoice.com
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
 </svg>
 </a>
 </div>
 </div>
 )}

 {/* Sync status strip — read-only status for the connected booking platform */}
 {integration?.platform && integration.status ==="connected" && PLATFORM_COLORS[integration.platform] && (
 <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-gray-200 rounded-2xl">
 <span className="relative flex h-2 w-2">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
 <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
 </span>
 <span className="text-xs font-bold text-gray-800">
 {PLATFORM_COLORS[integration.platform].label}
 </span>
 <span className="text-[11px] text-gray-500">·</span>
 <span className="text-[11px] text-gray-500">{formatSyncAgo(integration.last_synced_at)}</span>
 </div>
 )}

 {/* Month header + legend */}
 <div className="flex items-center justify-between gap-4 flex-wrap">
 <h2 className="text-xl font-semibold text-gray-900 tracking-tight">{monthLabel(cursor)}</h2>
 {sourcesThisMonth.length > 0 && (
 <div className="flex items-center gap-2 flex-wrap">
 {sourcesThisMonth.map((s) => (
 <span
 key={s.key}
 className={`px-2.5 py-1 ${s.bg} ${s.text} text-[10px] font-semibold rounded-full`}
 >
 {s.label}
 </span>
 ))}
 </div>
 )}
 </div>

 {/* Grid */}
 <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
 {/* Day-of-week header */}
 <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
 {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
 <div
 key={d}
 className="px-3 py-2 text-xs font-medium text-gray-500 text-center"
 >
 {d}
 </div>
 ))}
 </div>

 {/* 6-week grid */}
 <div className="grid grid-cols-7 grid-rows-6">
 {cells.map((d, i) => {
 const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
 const dayEvents = eventsByDay[key] ?? [];
 const inMonth = d.getMonth() === currentMonth;
 const isToday = key === todayKey;
 return (
 <div
 key={i}
 className={`min-h-[112px] border-b border-r border-gray-100 p-1.5 ${
 inMonth ?"bg-white" :"bg-gray-50/60"
 } ${i % 7 === 6 ?"border-r-0" :""} ${i >= 35 ?"border-b-0" :""}`}
 >
 <div className="flex items-center justify-between mb-1">
 <span
 className={`inline-flex items-center justify-center text-xs font-bold ${
 isToday
 ?"bg-amber-50 text-amber-900 border border-amber-300 rounded-full w-6 h-6"
 : inMonth
 ?"text-gray-700 w-6 h-6"
 :"text-gray-300 w-6 h-6"
 }`}
 >
 {d.getDate()}
 </span>
 {dayEvents.length > 3 && (
 <span className="text-[10px] text-gray-400 font-bold">
 +{dayEvents.length - 3}
 </span>
 )}
 </div>
 <div className="space-y-1">
 {dayEvents.slice(0, 3).map((ev) => {
 const c = eventColor(ev);
 const cancelled = ev.status ==="cancelled";
 return (
 <button
 key={ev.id}
 onClick={() => setSelected(ev)}
 className={`w-full text-left px-2 py-1 rounded-lg ${c.bg} ${c.text} text-[11px] font-semibold truncate hover:ring-2 hover:ring-offset-1 hover:ring-amber-300 transition ${
 cancelled ?"line-through opacity-60" :""
 }`}
 title={`${formatTime(ev.start_time)} · ${ev.title}`}
 >
 <span className="font-mono text-[10px] opacity-70">
 {formatTime(ev.start_time)}
 </span>{""}
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
 <p className="text-xs text-gray-400 italic text-center">Loading events…</p>
 )}

 {events.length === 0 && !loading && (
 <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
 <p className="text-sm font-bold text-gray-700">No appointments for {monthLabel(cursor)}</p>
 <p className="text-xs text-gray-500 mt-1">
 Events booked by your AI receptionist — and those synced from your connected booking platform — will appear here.
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
 className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-start justify-between gap-3">
 <div>
 <p className="text-xs font-medium text-gray-500">
 {monthKey(new Date(selected.start_time))} · {new Date(selected.start_time).toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" })}
 </p>
 <h3 className="text-xl font-semibold text-gray-900 mt-1">
 {selected.title}
 </h3>
 </div>
 <button
 onClick={() => setSelected(null)}
 className="text-gray-400 hover:text-gray-700 text-xl leading-none"
 aria-label="Close"
 >
 ×
 </button>
 </div>

 <div className="space-y-3 text-sm">
 <div className="flex items-center gap-2">
 <span className={`px-2 py-0.5 ${eventColor(selected).bg} ${eventColor(selected).text} text-[10px] font-semibold rounded-full`}>
 {eventColor(selected).label}
 </span>
 {selected.status !=="confirmed" && (
 <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-semibold rounded-full">
 {selected.status}
 </span>
 )}
 </div>

 <div>
 <p className="text-xs font-medium text-gray-500">Time</p>
 <p className="text-sm font-bold text-gray-800">
 {formatTime(selected.start_time)} – {formatTime(selected.end_time)}
 </p>
 </div>

 {selected.customer_name && (
 <div>
 <p className="text-xs font-medium text-gray-500">Customer</p>
 <p className="text-sm font-bold text-gray-800">{selected.customer_name}</p>
 {selected.customer_phone && (
 <p className="text-xs text-gray-500 font-mono">{selected.customer_phone}</p>
 )}
 </div>
 )}

 {selected.service_type && (
 <div>
 <p className="text-xs font-medium text-gray-500">Service</p>
 <p className="text-sm font-bold text-gray-800">{selected.service_type}</p>
 </div>
 )}

 {selected.description && (
 <div>
 <p className="text-xs font-medium text-gray-500">Notes</p>
 <p className="text-sm text-gray-600 whitespace-pre-wrap">{selected.description}</p>
 </div>
 )}

 {selected.last_synced_at && (
 <p className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">
 Synced from {selected.external_source} · {new Date(selected.last_synced_at).toLocaleString()}
 </p>
 )}
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
