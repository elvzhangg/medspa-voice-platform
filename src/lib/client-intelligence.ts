import { supabaseAdmin } from "./supabase";

/**
 * Client Intelligence — Phase 1
 *
 * Looks up a caller by phone on call start, feeds personalization
 * context into the AI, and records what the AI learned back to the
 * profile at call end.
 *
 * Ownership reminder:
 *   - Identity + preferences: cached here (source of truth is the
 *     booking platform once integrated).
 *   - Call data / AI memory: ours.
 *   - Appointments / payments / clinical: stay in the booking platform.
 */

export interface ClientProfile {
  id: string;
  tenant_id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  total_calls: number;
  total_bookings: number;
  last_call_at: string | null;
  last_booking_at: string | null;
  last_service: string | null;
  last_provider: string | null;
  preferred_provider: string | null;
  preferred_time: string | null;
  referral_source: string | null;
  tags: string[];
  staff_notes: string | null;
  no_personalization: boolean;
  provider_refs: Record<string, string>;
  call_history: CallHistoryEntry[];
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Phase 2 — booking-platform sync (nullable until first sync runs)
  last_synced_at?: string | null;
  sync_source?: string | null;
  sync_error?: string | null;
  lifetime_value_cents?: number | null;
  platform_visit_count?: number | null;
  platform_last_visit_at?: string | null;
  favorite_service?: string | null;
  favorite_staff?: string | null;
  // Memberships + sales summary (mig 039). The AI reads these on call start
  // to mention member benefits and remind callers of unused credits.
  total_sales_cents?: number | null;
  last_purchase_at?: string | null;
  active_memberships?: MembershipSummary[] | null;
  package_balances?: MembershipSummary[] | null;
}

export interface MembershipSummary {
  externalId?: string;
  name: string;
  kind?: "membership" | "package";
  remaining?: number;
  total?: number;
  program?: string;
  expiresAt?: string;
}

export interface CallHistoryEntry {
  call_id: string;
  started_at: string;
  duration_seconds: number | null;
  summary: string | null;
  booked: boolean;
  service: string | null;
}

const CALL_HISTORY_LIMIT = 10;

/**
 * Normalize a phone number to a stable form for lookup/storage.
 * Keeps leading + if present, strips everything else non-digit.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) return null;
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Fetch a caller's profile by phone, or null if not found.
 * Does NOT create a row — use ensureClientProfile for that.
 */
export async function lookupCaller(
  tenantId: string,
  phone: string | null | undefined
): Promise<ClientProfile | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("client_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("phone", normalized)
    .maybeSingle();

  if (error) {
    console.error("CLIENT_LOOKUP_ERROR:", error);
    return null;
  }
  return (data as ClientProfile) ?? null;
}

/**
 * Insert-or-get a profile row. Used at call start so subsequent
 * updates during the call have a stable id to target.
 */
export async function ensureClientProfile(
  tenantId: string,
  phone: string
): Promise<ClientProfile | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const existing = await lookupCaller(tenantId, normalized);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("client_profiles")
    .insert({ tenant_id: tenantId, phone: normalized })
    .select("*")
    .single();

  if (error) {
    // Race — another handler inserted first. Re-fetch.
    if ((error as any).code === "23505") {
      return lookupCaller(tenantId, normalized);
    }
    console.error("CLIENT_ENSURE_ERROR:", error);
    return null;
  }
  return data as ClientProfile;
}

type UpdatableField =
  | "first_name"
  | "last_name"
  | "email"
  | "preferred_provider"
  | "preferred_time"
  | "referral_source"
  | "staff_notes";

/**
 * Update profile fields and log every change to the audit table.
 * Only writes fields that actually changed.
 */
export async function updateClientProfile(params: {
  tenantId: string;
  phone: string;
  updates: Partial<Record<UpdatableField, string | null>>;
  source: "ai_call" | "staff_dashboard" | "booking_sync" | "webhook";
  sourceDetail?: string;
}): Promise<ClientProfile | null> {
  const profile = await ensureClientProfile(params.tenantId, params.phone);
  if (!profile) return null;

  const diff: Partial<Record<UpdatableField, string | null>> = {};
  const auditRows: Array<{
    client_profile_id: string;
    field: string;
    old_value: string | null;
    new_value: string | null;
    source: string;
    source_detail: string | null;
  }> = [];

  for (const [field, next] of Object.entries(params.updates) as Array<
    [UpdatableField, string | null | undefined]
  >) {
    if (next === undefined) continue;
    const current = (profile as any)[field] ?? null;
    const nextNorm = next === "" ? null : next;
    if (current === nextNorm) continue;
    diff[field] = nextNorm;
    auditRows.push({
      client_profile_id: profile.id,
      field,
      old_value: current,
      new_value: nextNorm,
      source: params.source,
      source_detail: params.sourceDetail ?? null,
    });
  }

  if (auditRows.length === 0) return profile;

  const { data, error } = await supabaseAdmin
    .from("client_profiles")
    .update({ ...diff, updated_at: new Date().toISOString(), updated_by: params.source })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error) {
    console.error("CLIENT_UPDATE_ERROR:", error);
    return null;
  }

  const { error: auditError } = await supabaseAdmin
    .from("client_profile_updates")
    .insert(auditRows);
  if (auditError) {
    console.error("CLIENT_AUDIT_ERROR:", auditError);
  }

  return data as ClientProfile;
}

/**
 * Called from end-of-call-report: bump counters, append call summary,
 * and remember what service/provider came up.
 */
export async function logCallOutcome(params: {
  tenantId: string;
  phone: string;
  callId: string;
  startedAt: string;
  durationSeconds: number | null;
  summary: string | null;
  booked: boolean;
  service?: string | null;
  provider?: string | null;
}): Promise<void> {
  const profile = await ensureClientProfile(params.tenantId, params.phone);
  if (!profile) return;

  const newEntry: CallHistoryEntry = {
    call_id: params.callId,
    started_at: params.startedAt,
    duration_seconds: params.durationSeconds,
    summary: params.summary,
    booked: params.booked,
    service: params.service ?? null,
  };

  const history = Array.isArray(profile.call_history) ? profile.call_history : [];
  const nextHistory = [newEntry, ...history].slice(0, CALL_HISTORY_LIMIT);

  const update: Record<string, unknown> = {
    total_calls: (profile.total_calls ?? 0) + 1,
    last_call_at: params.startedAt,
    call_history: nextHistory,
    updated_at: new Date().toISOString(),
    updated_by: "ai_call",
  };

  if (params.booked) {
    update.total_bookings = (profile.total_bookings ?? 0) + 1;
    update.last_booking_at = params.startedAt;
  }
  if (params.service) update.last_service = params.service;
  if (params.provider) update.last_provider = params.provider;

  const { error } = await supabaseAdmin
    .from("client_profiles")
    .update(update)
    .eq("id", profile.id);

  if (error) console.error("CLIENT_LOG_CALL_ERROR:", error);
}

/**
 * Render a short caller-context block for the AI system prompt.
 * Returns empty string if no profile, no phone, or caller opted out.
 */
export function buildCallerContext(profile: ClientProfile | null): string {
  if (!profile) return "";
  if (profile.no_personalization) return "";

  const lines: string[] = [];
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  if (name) lines.push(`Name on file: ${name}`);
  if (profile.total_calls > 0) {
    lines.push(
      `Prior calls: ${profile.total_calls}${
        profile.total_bookings ? ` (${profile.total_bookings} booked)` : ""
      }`
    );
  }
  if (profile.platform_last_visit_at) {
    const d = new Date(profile.platform_last_visit_at);
    if (!Number.isNaN(d.getTime())) {
      lines.push(`Last visit on record: ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
    }
  }
  if (profile.favorite_service) lines.push(`Most-booked service: ${profile.favorite_service}`);
  if (profile.favorite_staff) lines.push(`Most-booked with: ${profile.favorite_staff}`);
  if (profile.platform_visit_count && profile.platform_visit_count > 0) {
    lines.push(`Total visits on record: ${profile.platform_visit_count}`);
  }
  if (profile.last_service) lines.push(`Last service discussed: ${profile.last_service}`);
  if (profile.last_provider) lines.push(`Last provider: ${profile.last_provider}`);
  if (profile.preferred_provider) lines.push(`Preferred provider: ${profile.preferred_provider}`);
  if (profile.preferred_time) lines.push(`Preferred time: ${profile.preferred_time}`);
  if (profile.staff_notes) lines.push(`Staff notes: ${profile.staff_notes}`);
  if (profile.tags.length) lines.push(`Tags: ${profile.tags.join(", ")}`);

  // Memberships + package balances — short, scannable lines so the AI can
  // weave them into pricing conversations without sounding scripted.
  const formatBalance = (m: MembershipSummary): string => {
    const counts =
      typeof m.remaining === "number"
        ? typeof m.total === "number"
          ? `${m.remaining}/${m.total} remaining`
          : `${m.remaining} remaining`
        : "active";
    const expiry = m.expiresAt
      ? ` (expires ${new Date(m.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`
      : "";
    return `${m.name} — ${counts}${expiry}`;
  };
  if (profile.active_memberships?.length) {
    lines.push(
      `Active membership${profile.active_memberships.length > 1 ? "s" : ""}: ${profile.active_memberships
        .map(formatBalance)
        .join("; ")}`
    );
  }
  if (profile.package_balances?.length) {
    lines.push(
      `Package balance${profile.package_balances.length > 1 ? "s" : ""}: ${profile.package_balances
        .map(formatBalance)
        .join("; ")}`
    );
  }

  if (lines.length === 0) return "";

  return `\n## Caller Context (returning client — use naturally, don't read verbatim)\n${lines
    .map((l) => `- ${l}`)
    .join("\n")}\n- Greet them by first name if you have one. Don't announce that you "see their file" — just be warm and familiar.\n`;
}
