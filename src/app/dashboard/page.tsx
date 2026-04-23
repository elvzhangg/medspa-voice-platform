import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { deriveCallOutcomes, outcomePillProps, CallOutcome } from "@/lib/call-outcome";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────

interface CallLog {
  id: string;
  caller_number: string | null;
  duration_seconds: number | null;
  summary: string | null;
  created_at: string;
}

interface CalendarEvent {
  id: string;
  start_time: string;
  customer_name: string | null;
  service_type: string | null;
  status: string | null;
  sms_consent_granted_at: string | null;
  created_at: string;
}

interface Delta {
  current: number;
  prior: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const tenant = (await getCurrentTenant()) as {
    id: string;
    slug: string;
    name: string;
    phone_number: string;
    business_hours?: Record<string, { open: string; close: string } | undefined> | null;
    sms_followup_enabled?: boolean;
    sms_checkin_enabled?: boolean;
  } | null;
  if (!tenant) return null;

  const slug = tenant.slug;
  const now = Date.now();
  const weekStartMs = now - 7 * 24 * 60 * 60 * 1000;
  const priorWeekStartMs = now - 14 * 24 * 60 * 60 * 1000;
  const weekStart = new Date(weekStartMs).toISOString();
  const priorWeekStart = new Date(priorWeekStartMs).toISOString();

  // Today's window (local-naive — we use whatever the server returns; med
  // spas typically look at "today" same-day anyway).
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // ── Bulk data fetch (single round-trip where possible) ──────────────────
  const [
    callsThisWeekRes,
    callsPriorWeekRes,
    bookingsThisWeekRes,
    bookingsPriorWeekRes,
    newClientsThisWeekRes,
    newClientsPriorWeekRes,
    todayEventsRes,
    upcomingNoConsentRes,
    recentCallsRes,
    kbCountRes,
    procedureTemplatesRes,
    seenServicesRes,
    weeklyAftercareRes,
    providerDemandRes,
    nextWeekEventsRes,
    revenueThisWeekRes,
    revenuePriorWeekRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("call_logs")
      .select("id, caller_number, duration_seconds, summary, created_at")
      .eq("tenant_id", tenant.id)
      .gte("created_at", weekStart),
    supabaseAdmin
      .from("call_logs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gte("created_at", priorWeekStart)
      .lt("created_at", weekStart),
    supabaseAdmin
      .from("calendar_events")
      .select("id, service_type, created_at")
      .eq("tenant_id", tenant.id)
      .gte("created_at", weekStart),
    supabaseAdmin
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gte("created_at", priorWeekStart)
      .lt("created_at", weekStart),
    supabaseAdmin
      .from("client_profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gte("created_at", weekStart),
    supabaseAdmin
      .from("client_profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gte("created_at", priorWeekStart)
      .lt("created_at", weekStart),
    supabaseAdmin
      .from("calendar_events")
      .select("id, start_time, customer_name, service_type, status, sms_consent_granted_at, created_at")
      .eq("tenant_id", tenant.id)
      .gte("start_time", startOfToday.toISOString())
      .lte("start_time", endOfToday.toISOString())
      .order("start_time", { ascending: true }),
    supabaseAdmin
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gte("start_time", new Date().toISOString())
      .is("sms_consent_granted_at", null)
      .neq("status", "cancelled"),
    supabaseAdmin
      .from("call_logs")
      .select("id, caller_number, duration_seconds, summary, created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabaseAdmin
      .from("knowledge_base_documents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
    supabaseAdmin
      .from("post_procedure_templates")
      .select("service_name")
      .eq("tenant_id", tenant.id)
      .eq("active", true),
    supabaseAdmin
      .from("calendar_events")
      .select("service_type")
      .eq("tenant_id", tenant.id)
      .not("service_type", "is", null)
      .gte("created_at", priorWeekStart),
    supabaseAdmin
      .from("sms_sent_log")
      .select("id, template_type, status")
      .eq("tenant_id", tenant.id)
      .gte("sent_at", weekStart),
    supabaseAdmin
      .from("booking_requests")
      .select("provider_preference")
      .eq("tenant_id", tenant.id)
      .not("provider_preference", "is", null)
      .gte("created_at", weekStart),
    supabaseAdmin
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gte("start_time", new Date().toISOString())
      .lte(
        "start_time",
        new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
      )
      .neq("status", "cancelled"),
    // Per-visit revenue from connected platforms (Boulevard today). Null
    // price_cents rows — rare but possible when the platform hasn't
    // returned a price — are ignored in the SUM by Postgres.
    supabaseAdmin
      .from("client_visits")
      .select("price_cents")
      .eq("tenant_id", tenant.id)
      .gte("visit_at", weekStart),
    supabaseAdmin
      .from("client_visits")
      .select("price_cents")
      .eq("tenant_id", tenant.id)
      .gte("visit_at", priorWeekStart)
      .lt("visit_at", weekStart),
  ]);

  // ── Derived metrics ─────────────────────────────────────────────────────
  const callsThisWeek = (callsThisWeekRes.data ?? []) as CallLog[];
  const bookingsThisWeek = (bookingsThisWeekRes.data ?? []) as Array<{ id: string; service_type: string | null; created_at: string }>;

  const afterHoursCount = callsThisWeek.filter((c) =>
    isAfterHours(new Date(c.created_at), tenant.business_hours ?? undefined)
  ).length;

  // Prior-week after-hours is expensive to compute exactly; for the delta
  // chip we approximate using the prior-week total × same after-hours ratio.
  // Good enough for a trend indicator, not a billable metric.
  const afterHoursRatio = callsThisWeek.length
    ? afterHoursCount / callsThisWeek.length
    : 0;
  const priorWeekCalls = callsPriorWeekRes.count ?? 0;
  const afterHoursPrior = Math.round(priorWeekCalls * afterHoursRatio);

  const bookingsCount = bookingsThisWeek.length;
  const conversion = callsThisWeek.length
    ? Math.round((bookingsCount / callsThisWeek.length) * 100)
    : 0;
  const priorWeekBookings = bookingsPriorWeekRes.count ?? 0;
  const priorConversion = priorWeekCalls ? Math.round((priorWeekBookings / priorWeekCalls) * 100) : 0;

  const newClients: Delta = {
    current: newClientsThisWeekRes.count ?? 0,
    prior: newClientsPriorWeekRes.count ?? 0,
  };
  const bookings: Delta = { current: bookingsCount, prior: priorWeekBookings };
  const afterHours: Delta = { current: afterHoursCount, prior: afterHoursPrior };
  const conv: Delta = { current: conversion, prior: priorConversion };

  const sumCents = (rows: Array<{ price_cents: number | null }> | null) =>
    (rows ?? []).reduce((acc, r) => acc + (r.price_cents ?? 0), 0);
  const revenue: Delta = {
    current: sumCents(revenueThisWeekRes.data as Array<{ price_cents: number | null }> | null),
    prior: sumCents(revenuePriorWeekRes.data as Array<{ price_cents: number | null }> | null),
  };

  // ── Today strip ─────────────────────────────────────────────────────────
  const todayEvents = (todayEventsRes.data ?? []) as CalendarEvent[];
  const upcomingToday = todayEvents.filter(
    (e) => new Date(e.start_time).getTime() >= now && e.status !== "cancelled"
  );
  const firstToday = upcomingToday[0];

  // ── Recent calls w/ outcome ─────────────────────────────────────────────
  const recentCalls = (recentCallsRes.data ?? []) as CallLog[];
  const outcomes = await deriveCallOutcomes(tenant.id, recentCalls);

  // ── Missed opportunities (last 7d, info outcome, distinct caller) ───────
  // These are calls where someone spoke to Vivienne but didn't book — the
  // ideal winback candidates. We pull a wider window than Recent Calls and
  // dedupe by phone so the list surfaces people, not every call attempt.
  const missedOppsOutcomes = await deriveCallOutcomes(tenant.id, callsThisWeek);
  const missedOppsByPhone = new Map<string, CallLog>();
  for (const call of callsThisWeek) {
    const outcome = missedOppsOutcomes.get(call.id);
    if (!outcome || outcome.kind !== "info") continue;
    if (!call.caller_number) continue;
    const existing = missedOppsByPhone.get(call.caller_number);
    if (!existing || new Date(call.created_at) > new Date(existing.created_at)) {
      missedOppsByPhone.set(call.caller_number, call);
    }
  }
  const missedOpps = Array.from(missedOppsByPhone.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  // ── Time saved (total caller-time Vivienne handled this week) ───────────
  const totalSecondsHandled = callsThisWeek.reduce(
    (acc, c) => acc + (c.duration_seconds ?? 0),
    0
  );

  // ── Provider demand (who got requested most this week) ──────────────────
  const topProvider = topCount(
    ((providerDemandRes.data ?? []) as Array<{ provider_preference: string | null }>)
      .map((r) => (r.provider_preference ?? "").trim())
      .filter((p) => p && !/no preference|any|anyone/i.test(p))
  );

  // ── Insights ────────────────────────────────────────────────────────────
  const topService = topCount(
    bookingsThisWeek.map((b) => b.service_type).filter(Boolean) as string[]
  );
  const aftercareStats = summariseAftercare(
    (weeklyAftercareRes.data ?? []) as Array<{ id: string; template_type: string; status: string }>
  );

  // ── Priority queue (action items) ───────────────────────────────────────
  const coveredServices = new Set(
    ((procedureTemplatesRes.data ?? []) as Array<{ service_name: string }>).map((r) =>
      r.service_name.toLowerCase()
    )
  );
  const distinctSeen = Array.from(
    new Set(
      ((seenServicesRes.data ?? []) as Array<{ service_type: string | null }>)
        .map((r) => (r.service_type ?? "").trim())
        .filter(Boolean)
    )
  );
  const uncoveredServices = distinctSeen.filter((s) => !coveredServices.has(s.toLowerCase()));

  const kbCount = kbCountRes.count ?? 0;
  const actions: ActionItem[] = [];
  if (tenant.sms_followup_enabled && uncoveredServices.length > 0) {
    actions.push({
      severity: "warn",
      title: `${uncoveredServices.length} service${uncoveredServices.length === 1 ? "" : "s"} missing aftercare guideline`,
      body: uncoveredServices.slice(0, 3).join(", ") + (uncoveredServices.length > 3 ? "…" : ""),
      cta: "Add guidelines",
      href: `/${slug}/dashboard/messaging/post-procedure`,
    });
  }
  if (
    (tenant.sms_followup_enabled || tenant.sms_checkin_enabled) &&
    (upcomingNoConsentRes.count ?? 0) > 0
  ) {
    actions.push({
      severity: "warn",
      title: `${upcomingNoConsentRes.count} upcoming appointments missing SMS consent`,
      body: "These clients won't receive aftercare texts. Capture consent on their next call.",
      cta: "Review calendar",
      href: `/${slug}/dashboard/calendar`,
    });
  }
  if (kbCount < 3) {
    actions.push({
      severity: "info",
      title: "Your knowledge base is thin",
      body: `${kbCount} doc${kbCount === 1 ? "" : "s"} — the AI does its best work with 3+ covering services, pricing, and policies.`,
      cta: "Add a doc",
      href: `/${slug}/dashboard/knowledge-base`,
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl text-zinc-900">Overview</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {tenant.name} · {formatRange(weekStartMs, now)}
        </p>
      </div>

      {/* Hero: 4 ROI cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <RevenueCard
          label="Revenue booked"
          cents={revenue.current}
          delta={revenue}
          emptyState="Real transaction amounts will appear here once your platform (Boulevard today) syncs a completed visit."
        />
        <RoiCard
          accent="emerald"
          label="Booked this week"
          value={bookings.current}
          unit={bookings.current === 1 ? "appointment" : "appointments"}
          suffix={
            callsThisWeek.length && conv.current > 0
              ? `${conv.current}% · ${bookings.current} of ${callsThisWeek.length} calls`
              : ""
          }
          delta={bookings}
          emptyState="Your first AI-booked appointment will show up here."
        />
        <RoiCard
          accent="amber"
          label="After-hours coverage"
          value={afterHours.current}
          unit={afterHours.current === 1 ? "call while closed" : "calls while closed"}
          delta={afterHours}
          emptyState="Calls that came in outside business hours."
        />
        <RoiCard
          accent="sky"
          label="New clients captured"
          value={newClients.current}
          unit={newClients.current === 1 ? "first-time caller" : "first-time callers"}
          delta={newClients}
          emptyState="New voices Vivienne met this week."
        />
      </div>

      {/* Today strip */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-amber-50/30 px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Today at the clinic</p>
              <p className="text-lg font-bold text-zinc-900 mt-0.5">
                {upcomingToday.length === 0
                  ? "Nothing on the books"
                  : `${upcomingToday.length} upcoming appointment${upcomingToday.length === 1 ? "" : "s"}`}
              </p>
            </div>
            {firstToday && (
              <div className="pl-6 border-l border-zinc-200">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Next up</p>
                <p className="text-sm font-bold text-zinc-900 mt-0.5">
                  {formatTime(firstToday.start_time)} · {firstToday.customer_name || "Guest"}
                  {firstToday.service_type ? ` · ${firstToday.service_type}` : ""}
                </p>
              </div>
            )}
          </div>
          <Link
            href={`/${slug}/dashboard/calendar`}
            className="text-xs font-semibold text-amber-900 hover:text-amber-700"
          >
            Open calendar →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Recent Calls + Insights */}
        <div className="col-span-2 space-y-6">
          {/* Insights */}
          {(topService || aftercareStats.sent > 0 || topProvider || totalSecondsHandled > 0) && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-zinc-900 text-sm">Vivienne's insights this week</h2>
              </div>
              <div className="grid grid-cols-2 gap-5">
                {totalSecondsHandled > 0 && (
                  <InsightTile
                    label="Caller time handled"
                    value={formatDurationLong(totalSecondsHandled)}
                    sub={describeTimeSaved(totalSecondsHandled)}
                  />
                )}
                {topService && (
                  <InsightTile
                    label="Most-booked service"
                    value={topService.key}
                    sub={`${topService.count} booking${topService.count === 1 ? "" : "s"}`}
                  />
                )}
                {topProvider && (
                  <InsightTile
                    label="Most-requested provider"
                    value={topProvider.key}
                    sub={`${topProvider.count} caller${topProvider.count === 1 ? "" : "s"} asked for them`}
                  />
                )}
                {aftercareStats.sent > 0 && (
                  <InsightTile
                    label="Aftercare texts sent"
                    value={String(aftercareStats.sent)}
                    sub={`${aftercareStats.skipped} skipped · ${aftercareStats.failed} failed`}
                  />
                )}
              </div>
            </div>
          )}

          {/* Missed Opportunities — callers who didn't book, ripe for winback */}
          {missedOpps.length > 0 && (
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
                <div>
                  <h2 className="font-semibold text-zinc-900 text-sm">Missed opportunities</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Callers who asked questions this week but didn't book. Draft a personalized follow-up with Vivienne.
                  </p>
                </div>
              </div>
              <div>
                {missedOpps.map((call, i) => (
                  <MissedRow
                    key={call.id}
                    call={call}
                    isLast={i === missedOpps.length - 1}
                    slug={slug}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent Calls */}
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h2 className="font-semibold text-zinc-900 text-sm">Recent calls</h2>
              <Link
                href={`/${slug}/dashboard/calls`}
                className="text-xs text-amber-700 hover:text-amber-800 font-medium"
              >
                View all →
              </Link>
            </div>
            {recentCalls.length === 0 ? (
              <div className="text-center py-14">
                <p className="text-sm font-medium text-zinc-600 mb-1">No calls yet</p>
                <p className="text-xs text-zinc-400">Calls will appear here once your number is active.</p>
              </div>
            ) : (
              <div>
                {recentCalls.map((call, i) => (
                  <CallRow
                    key={call.id}
                    call={call}
                    outcome={outcomes.get(call.id)}
                    isLast={i === recentCalls.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Priority Queue + Next-week pipeline */}
        <div className="space-y-4">
          {(nextWeekEventsRes.count ?? 0) > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Next 7 days</p>
              <p className="text-2xl font-bold text-zinc-900 tabular-nums mt-1">
                {nextWeekEventsRes.count}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                appointment{nextWeekEventsRes.count === 1 ? "" : "s"} on the books
              </p>
              <Link
                href={`/${slug}/dashboard/calendar`}
                className="text-xs font-semibold text-amber-900 hover:text-amber-700 mt-3 inline-block"
              >
                Open calendar →
              </Link>
            </div>
          )}
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100">
              <h2 className="font-semibold text-zinc-900 text-sm">What needs attention</h2>
            </div>
            {actions.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-zinc-900">You're all set</p>
                <p className="text-xs text-zinc-500 mt-1">No pending action items right now.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-50">
                {actions.map((a, i) => (
                  <ActionRow key={i} item={a} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Components ───────────────────────────────────────────────────────────

function RevenueCard({
  label,
  cents,
  delta,
  emptyState,
}: {
  label: string;
  cents: number;
  delta: Delta;
  emptyState: string;
}) {
  const isZero = delta.current === 0 && delta.prior === 0;
  const diffCents = delta.current - delta.prior;
  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden hover:shadow-sm transition-all">
      <div className="h-1 bg-gradient-to-r from-lime-300 to-emerald-500" />
      <div className="p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</p>
        {isZero ? (
          <>
            <p className="text-xl font-serif text-zinc-900 mt-2">—</p>
            <p className="text-xs text-zinc-500 mt-1.5 leading-snug">{emptyState}</p>
          </>
        ) : (
          <>
            <p className="text-3xl font-bold text-zinc-900 tabular-nums mt-2">
              {formatCurrency(cents)}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">completed visits this week</p>
            {delta.prior > 0 && <RevenueDeltaChip diffCents={diffCents} />}
          </>
        )}
      </div>
    </div>
  );
}

function RevenueDeltaChip({ diffCents }: { diffCents: number }) {
  if (diffCents === 0) {
    return <p className="text-[11px] text-zinc-400 mt-2">= same as last week</p>;
  }
  const positive = diffCents > 0;
  const arrow = positive ? "↑" : "↓";
  const color = positive ? "text-emerald-700" : "text-rose-600";
  return (
    <p className={`text-[11px] font-semibold ${color} mt-2`}>
      {arrow} {formatCurrency(Math.abs(diffCents))} vs last week
    </p>
  );
}

function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 10000) return `$${Math.round(dollars).toLocaleString()}`;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function RoiCard({
  accent,
  label,
  value,
  unit,
  suffix,
  delta,
  emptyState,
  isPercent,
}: {
  accent: "emerald" | "amber" | "sky" | "violet";
  label: string;
  value: number;
  unit: string;
  suffix?: string;
  delta: Delta;
  emptyState: string;
  isPercent?: boolean;
}) {
  const barColor = {
    emerald: "from-emerald-300 to-emerald-500",
    amber: "from-amber-300 to-amber-500",
    sky: "from-sky-300 to-sky-500",
    violet: "from-violet-300 to-violet-500",
  }[accent];
  const diff = delta.current - delta.prior;
  const isZero = delta.current === 0 && delta.prior === 0;

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden hover:shadow-sm transition-all">
      <div className={`h-1 bg-gradient-to-r ${barColor}`} />
      <div className="p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</p>
        {isZero ? (
          <>
            <p className="text-xl font-serif text-zinc-900 mt-2">—</p>
            <p className="text-xs text-zinc-500 mt-1.5 leading-snug">{emptyState}</p>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-1 mt-2">
              <p className="text-3xl font-bold text-zinc-900 tabular-nums">{value}</p>
              {isPercent && <p className="text-lg font-bold text-zinc-500">%</p>}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{unit}</p>
            {suffix && <p className="text-[11px] text-zinc-400 mt-0.5">{suffix}</p>}
            {delta.prior > 0 && (
              <DeltaChip diff={diff} isPercent={isPercent} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DeltaChip({ diff, isPercent }: { diff: number; isPercent?: boolean }) {
  if (diff === 0) {
    return <p className="text-[11px] text-zinc-400 mt-2">= same as last week</p>;
  }
  const positive = diff > 0;
  const arrow = positive ? "↑" : "↓";
  const color = positive ? "text-emerald-700" : "text-rose-600";
  const label = isPercent ? `${Math.abs(diff)} pts` : Math.abs(diff);
  return (
    <p className={`text-[11px] font-semibold ${color} mt-2`}>
      {arrow} {label} vs last week
    </p>
  );
}

function InsightTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="text-base font-bold text-zinc-900 mt-1 truncate">{value}</p>
      <p className="text-[11px] text-zinc-500 mt-0.5">{sub}</p>
    </div>
  );
}

function CallRow({
  call,
  outcome,
  isLast,
}: {
  call: CallLog;
  outcome: CallOutcome | undefined;
  isLast: boolean;
}) {
  const pill = outcome ? outcomePillProps(outcome) : null;
  return (
    <div className={`flex items-center gap-4 px-6 py-3.5 ${isLast ? "" : "border-b border-zinc-50"}`}>
      <div className="w-8 h-8 bg-gradient-to-br from-amber-200 to-amber-300 rounded-full flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-zinc-900">
            {formatPhone(call.caller_number) || "Unknown caller"}
          </p>
          {pill && (
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${pill.className}`}>
              {pill.label}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-400 truncate">
          {call.summary || "No summary available"}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-medium text-zinc-600 tabular-nums">
          {formatDuration(call.duration_seconds)}
        </p>
        <p className="text-xs text-zinc-400">
          {formatRelative(new Date(call.created_at))}
        </p>
      </div>
    </div>
  );
}

function MissedRow({
  call,
  isLast,
  slug,
}: {
  call: CallLog;
  isLast: boolean;
  slug: string;
}) {
  // First sentence of the call summary is usually the ask — what the caller
  // wanted. Fallback to a generic line when we have nothing.
  const ask = call.summary
    ? call.summary.split(/(?<=[.!?])\s+/)[0].slice(0, 140)
    : "No summary captured — review the transcript to see what they needed.";
  return (
    <div
      className={`flex items-center gap-4 px-6 py-3.5 ${
        isLast ? "" : "border-b border-zinc-50"
      }`}
    >
      <div className="w-8 h-8 bg-gradient-to-br from-sky-100 to-sky-200 rounded-full flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-sky-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-900">
          {formatPhone(call.caller_number) || "Unknown caller"}
          <span className="text-xs font-normal text-zinc-400 ml-2">
            {formatRelative(new Date(call.created_at))}
            {" · "}
            {formatDuration(call.duration_seconds)}
          </span>
        </p>
        <p className="text-xs text-zinc-500 truncate leading-snug mt-0.5">{ask}</p>
      </div>
      <Link
        href={`/${slug}/dashboard/calls/${call.id}/followup`}
        className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-amber-400 text-amber-900 hover:bg-amber-50 transition-colors"
      >
        Draft follow-up →
      </Link>
    </div>
  );
}

interface ActionItem {
  severity: "warn" | "info";
  title: string;
  body: string;
  cta: string;
  href: string;
}

function ActionRow({ item }: { item: ActionItem }) {
  const dotColor = item.severity === "warn" ? "bg-amber-500" : "bg-sky-400";
  return (
    <Link href={item.href} className="block px-5 py-3.5 hover:bg-zinc-50 transition-colors group">
      <div className="flex items-start gap-3">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-2 shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900 leading-snug">{item.title}</p>
          <p className="text-xs text-zinc-500 mt-1 leading-snug">{item.body}</p>
          <p className="text-xs font-semibold text-amber-800 mt-1.5 group-hover:text-amber-700">
            {item.cta} →
          </p>
        </div>
      </div>
    </Link>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatDurationLong(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function describeTimeSaved(totalSeconds: number): string {
  const mins = Math.round(totalSeconds / 60);
  if (mins < 30) return "Warming up — Vivienne's logged some live minutes.";
  if (mins < 120) return "Roughly a full break for your front desk.";
  if (mins < 240) return "About a half-shift you didn't have to staff.";
  return "A full receptionist shift handled by Vivienne.";
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRange(fromMs: number, toMs: number): string {
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(from)} – ${fmt(to)}`;
}

// Fallback after-hours heuristic: before 9a or after 6p local if no tenant
// business_hours config. Once a tenant fills in their hours we use the exact
// open/close window per day of week.
function isAfterHours(
  d: Date,
  businessHours?: Record<string, { open: string; close: string } | undefined>
): boolean {
  const dayKey = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][d.getDay()];
  const hours = businessHours?.[dayKey];
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (!hours) {
    return minutes < 9 * 60 || minutes >= 18 * 60;
  }
  const parseMin = (s: string) => {
    const [h, m] = s.split(":").map((n) => parseInt(n, 10));
    return h * 60 + (m || 0);
  };
  return minutes < parseMin(hours.open) || minutes >= parseMin(hours.close);
}

function topCount(values: string[]): { key: string; count: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) {
    const k = v.trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let top: { key: string; count: number } | null = null;
  for (const [key, count] of counts) {
    if (!top || count > top.count) top = { key, count };
  }
  return top;
}

function summariseAftercare(
  rows: Array<{ template_type: string; status: string }>
): { sent: number; skipped: number; failed: number } {
  const aftercare = rows.filter((r) => r.template_type === "followup" || r.template_type === "checkin");
  return {
    sent: aftercare.filter((r) => r.status === "sent").length,
    skipped: aftercare.filter((r) => r.status.startsWith("skipped")).length,
    failed: aftercare.filter((r) => r.status === "failed").length,
  };
}
