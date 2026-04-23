import { supabaseAdmin } from "./supabase";

// Derives a user-facing outcome label for each call in the Overview page.
// The source of truth is whether a booking materialized, so this is really
// a phone+time-window join against booking_requests, with a fallback
// heuristic (very short calls = missed) when no booking matched.

export type CallOutcome =
  | { kind: "booked"; service: string | null }
  | { kind: "referral" }
  | { kind: "info" }
  | { kind: "missed" };

interface InputCall {
  id: string;
  caller_number: string | null;
  duration_seconds: number | null;
  summary: string | null;
  created_at: string;
}

// ±2h window around the call to match a booking_request. Med spa bookings
// almost always get created during the call itself; the padding just
// protects us against clock skew or async writes.
const MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;

export async function deriveCallOutcomes(
  tenantId: string,
  calls: InputCall[]
): Promise<Map<string, CallOutcome>> {
  const result = new Map<string, CallOutcome>();
  if (calls.length === 0) return result;

  const phones = Array.from(
    new Set(calls.map((c) => c.caller_number).filter(Boolean) as string[])
  );

  // Bookings created by any of these callers within the last ~2h window we
  // care about. One round-trip, then correlate in memory.
  const earliest = new Date(
    Math.min(...calls.map((c) => new Date(c.created_at).getTime())) - MATCH_WINDOW_MS
  ).toISOString();
  const latest = new Date(
    Math.max(...calls.map((c) => new Date(c.created_at).getTime())) + MATCH_WINDOW_MS
  ).toISOString();

  const { data: bookings } = phones.length
    ? await supabaseAdmin
        .from("booking_requests")
        .select("customer_phone, service, created_at")
        .eq("tenant_id", tenantId)
        .in("customer_phone", phones)
        .gte("created_at", earliest)
        .lte("created_at", latest)
    : { data: [] as Array<{ customer_phone: string; service: string | null; created_at: string }> };

  // Referrals logged during the call window are a secondary signal. These
  // tend to be short conversations where the caller said "so-and-so sent me"
  // and the AI logged them without booking — still a valuable outcome.
  const { data: referrals } = phones.length
    ? await supabaseAdmin
        .from("referrals")
        .select("new_patient_phone, created_at")
        .eq("tenant_id", tenantId)
        .in("new_patient_phone", phones)
        .gte("created_at", earliest)
        .lte("created_at", latest)
    : { data: [] as Array<{ new_patient_phone: string | null; created_at: string }> };

  for (const call of calls) {
    const callTime = new Date(call.created_at).getTime();

    // 1. Booked? Any matching booking_request in the ±2h window.
    const booking = (bookings ?? []).find((b) => {
      if (!call.caller_number || b.customer_phone !== call.caller_number) return false;
      const delta = Math.abs(new Date(b.created_at).getTime() - callTime);
      return delta <= MATCH_WINDOW_MS;
    });
    if (booking) {
      result.set(call.id, { kind: "booked", service: booking.service ?? null });
      continue;
    }

    // 2. Referral logged?
    const referral = (referrals ?? []).find((r) => {
      if (!call.caller_number || r.new_patient_phone !== call.caller_number) return false;
      const delta = Math.abs(new Date(r.created_at).getTime() - callTime);
      return delta <= MATCH_WINDOW_MS;
    });
    if (referral) {
      result.set(call.id, { kind: "referral" });
      continue;
    }

    // 3. Very short + no summary = likely missed / hangup.
    const dur = call.duration_seconds ?? 0;
    if (dur > 0 && dur < 15 && !call.summary) {
      result.set(call.id, { kind: "missed" });
      continue;
    }

    // 4. Default — treat as info/question call.
    result.set(call.id, { kind: "info" });
  }

  return result;
}

export function outcomePillProps(outcome: CallOutcome): { label: string; className: string } {
  switch (outcome.kind) {
    case "booked":
      return {
        label: outcome.service ? `Booked · ${outcome.service}` : "Booked",
        className: "bg-emerald-100 text-emerald-800",
      };
    case "referral":
      return { label: "Referral", className: "bg-violet-100 text-violet-800" };
    case "info":
      return { label: "Info", className: "bg-sky-100 text-sky-800" };
    case "missed":
      return { label: "Missed", className: "bg-zinc-100 text-zinc-600" };
  }
}
