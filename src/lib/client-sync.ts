import { supabaseAdmin } from "./supabase";
import { loadTenantIntegration } from "./integrations";
import { ensureClientProfile, normalizePhone } from "./client-intelligence";
import type { AdapterClientHistory, AdapterClientRecord } from "./integrations/types";

/**
 * Client Intelligence — Phase 2
 *
 * Pulls a caller's real history (identity + past visits + lifetime value)
 * from the tenant's booking platform and caches it on client_profiles so
 * the AI can greet returning clients with grounded context:
 *   "Welcome back Sarah — want your usual Morpheus8 with Dr. Chen?"
 *
 * Ownership rules still hold:
 *   - Platform is the source of truth for identity + appointments + spend.
 *   - Our cache is write-through-on-call, refreshed lazily, and never
 *     exposed back to the platform.
 *
 * Refresh policy:
 *   - Stale if last_synced_at > STALE_AFTER_MS ago, or null.
 *   - Fire-and-forget from assistant-builder.ts — don't block call start.
 *   - A failed sync only logs; caller still gets Phase-1 personalization.
 */

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

export function isProfileStale(lastSyncedAt: string | null | undefined): boolean {
  if (!lastSyncedAt) return true;
  const t = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > STALE_AFTER_MS;
}

/**
 * Mode-mode: pick the string that appears most often in an array.
 * We use it to derive "favorite service" and "favorite staff" from the
 * visit list. Ties break arbitrarily — fine for greeting copy.
 */
function mostFrequent(values: Array<string | undefined>): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  return best;
}

/**
 * Sync a single client. Safe to call without awaiting.
 *   - Resolves the tenant's adapter; bails if not direct-book or the
 *     adapter doesn't implement getClientHistory (only Boulevard today).
 *   - Writes identity + history back to client_profiles.
 *   - Records sync_error on failure so the admin can diagnose.
 */
export async function syncClientFromPlatform(
  tenantId: string,
  phone: string
): Promise<void> {
  const normalized = normalizePhone(phone);
  if (!normalized) return;

  try {
    const integration = await loadTenantIntegration(tenantId);
    if (!integration?.adapter?.getClientHistory) return;

    const history: AdapterClientHistory | null = await integration.adapter.getClientHistory(
      integration.ctx,
      { phone: normalized }
    );

    // Make sure there's a row to update — if the caller is brand-new to us,
    // ensureClientProfile creates it keyed on (tenant, phone).
    const profile = await ensureClientProfile(tenantId, normalized);
    if (!profile) return;

    const now = new Date().toISOString();

    if (!history) {
      // No match on the platform — still mark as synced so we don't hammer
      // their API on every subsequent call for the same unknown number.
      await supabaseAdmin
        .from("client_profiles")
        .update({
          last_synced_at: now,
          sync_source: integration.adapter.platform,
          sync_error: null,
        })
        .eq("id", profile.id);
      return;
    }

    const sortedVisits = [...history.visits].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const lastVisit = sortedVisits[0];
    const favoriteService = mostFrequent(sortedVisits.map((v) => v.service));
    const favoriteStaff = mostFrequent(sortedVisits.map((v) => v.staff));

    const providerRefs = {
      ...(profile.provider_refs ?? {}),
      [integration.adapter.platform]: history.clientId,
    };

    const update: Record<string, unknown> = {
      last_synced_at: now,
      sync_source: integration.adapter.platform,
      sync_error: null,
      provider_refs: providerRefs,
      platform_visit_count: history.visits.length,
      platform_last_visit_at: lastVisit?.date ?? null,
      lifetime_value_cents: history.lifetimeValueCents ?? null,
      favorite_service: favoriteService ?? null,
      favorite_staff: favoriteStaff ?? null,
    };

    // Only fill identity fields if we don't already have them — staff
    // edits made in our dashboard win over platform values.
    if (!profile.first_name && history.firstName) update.first_name = history.firstName;
    if (!profile.last_name && history.lastName) update.last_name = history.lastName;
    if (!profile.email && history.email) update.email = history.email;

    // Seed last_service / last_provider too when we haven't seen them on a
    // call yet — that way the first-time ring still benefits from sync.
    if (!profile.last_service && favoriteService) update.last_service = favoriteService;
    if (!profile.last_provider && favoriteStaff) update.last_provider = favoriteStaff;

    await supabaseAdmin.from("client_profiles").update(update).eq("id", profile.id);

    // Persist each visit individually so the dashboard can do weekly
    // revenue math without re-fetching from the platform. Upsert by
    // (tenant, platform, external_id) — a subsequent sync for the same
    // appointment updates price/status in place (platforms retroactively
    // flip state from BOOKED → COMPLETED once the visit closes).
    const platform = integration.adapter.platform;
    const visitRows = sortedVisits
      .filter((v) => v.externalId && v.date)
      .map((v) => ({
        tenant_id: tenantId,
        client_profile_id: profile.id,
        platform,
        external_id: v.externalId as string,
        service: v.service ?? null,
        provider: v.staff ?? null,
        price_cents: typeof v.priceCents === "number" ? v.priceCents : null,
        visit_at: v.date,
        status: v.status ?? null,
        raw: (v.raw ?? null) as object | null,
        synced_at: now,
      }));
    if (visitRows.length > 0) {
      const { error: visitErr } = await supabaseAdmin
        .from("client_visits")
        .upsert(visitRows, { onConflict: "tenant_id,platform,external_id" });
      if (visitErr) {
        console.error("CLIENT_VISITS_UPSERT_ERR:", visitErr);
      }
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("CLIENT_SYNC_ERR:", detail);
    try {
      await supabaseAdmin
        .from("client_profiles")
        .update({ sync_error: detail.slice(0, 500), last_synced_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("phone", normalized);
    } catch {
      // best-effort
    }
  }
}

/**
 * Fire-and-forget wrapper for the call-start hot path. Caller does not
 * await this; any errors are swallowed (already logged inside).
 */
export function syncClientFromPlatformBackground(tenantId: string, phone: string): void {
  void syncClientFromPlatform(tenantId, phone);
}

// ─── Bulk pre-warm of recent + VIP clients ──────────────────────────────────
//
// Runs as part of the full tenant sync (after appointment-sync has
// populated calendar_events). Pre-creates client_profiles for everyone
// who's visited recently or visits often, so the AI greets them with
// grounded context on their first call after integration setup —
// instead of waiting for the lazy on-call sync to run.
//
// Source: calendar_events (platform-sourced rows only). No extra API
// round-trip — pure DB aggregation. The appointment backfill is what
// gets the data into calendar_events in the first place.
//
// Eligibility (a phone qualifies for pre-warm if EITHER):
//   - Recent: at least 1 visit in the last RECENT_WINDOW_DAYS
//   - VIP:    at least VIP_VISIT_THRESHOLD visits in the scan window
//
// Anyone not qualifying still gets the lazy on-call sync via
// syncClientFromPlatform — this just covers the warm cases up front.

const RECENT_WINDOW_DAYS = 30;       // "recent" = visited within the last month
const SCAN_WINDOW_DAYS = 90;         // VIP scoring looks back this far
const VIP_VISIT_THRESHOLD = 3;       // visits needed to qualify as VIP

export interface RecentClientSyncResult {
  tenantId: string;
  scanned: number;     // unique phones found in calendar_events window
  upserted: number;    // client_profiles written
  errored: boolean;
  errorMessage?: string;
}

interface CalRow {
  customer_phone: string | null;
  customer_name: string | null;
  service_type: string | null;
  description: string | null;
  start_time: string;
  external_source: string | null;
}

interface PhoneAgg {
  phone: string;
  name?: string;
  services: string[];
  staffs: string[];
  visits: string[];          // ISO timestamps, unsorted
  platform: string;          // first external_source we see for this phone
}

export async function syncRecentClientsForTenant(
  tenantId: string
): Promise<RecentClientSyncResult> {
  const result: RecentClientSyncResult = {
    tenantId,
    scanned: 0,
    upserted: 0,
    errored: false,
  };

  try {
    const scanCutoff = new Date(
      Date.now() - SCAN_WINDOW_DAYS * 86_400_000
    ).toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from("calendar_events")
      .select(
        "customer_phone, customer_name, service_type, description, start_time, external_source"
      )
      .eq("tenant_id", tenantId)
      .not("customer_phone", "is", null)
      .not("external_source", "is", null)
      .gte("start_time", scanCutoff);

    if (error) {
      result.errored = true;
      result.errorMessage = error.message;
      return result;
    }

    // Aggregate per normalized phone
    const agg = new Map<string, PhoneAgg>();
    for (const row of (rows ?? []) as CalRow[]) {
      const phone = normalizePhone(row.customer_phone);
      if (!phone) continue;

      let entry = agg.get(phone);
      if (!entry) {
        entry = {
          phone,
          services: [],
          staffs: [],
          visits: [],
          platform: row.external_source ?? "unknown",
        };
        agg.set(phone, entry);
      }
      if (!entry.name && row.customer_name) entry.name = row.customer_name;
      if (row.service_type) entry.services.push(row.service_type);
      // Calendar events store provider as "With Dr. Smith" in description —
      // strip the "With " prefix written by both the webhook and backfill.
      if (row.description?.startsWith("With ")) {
        entry.staffs.push(row.description.slice("With ".length));
      }
      entry.visits.push(row.start_time);
    }

    result.scanned = agg.size;

    const recentCutoffMs = Date.now() - RECENT_WINDOW_DAYS * 86_400_000;
    const now = new Date().toISOString();

    for (const entry of agg.values()) {
      const visitCount = entry.visits.length;
      const lastVisit = entry.visits.reduce((latest, v) =>
        new Date(v).getTime() > new Date(latest).getTime() ? v : latest
      );
      const recent = new Date(lastVisit).getTime() >= recentCutoffMs;
      const vip = visitCount >= VIP_VISIT_THRESHOLD;
      if (!recent && !vip) continue;

      const profile = await ensureClientProfile(tenantId, entry.phone);
      if (!profile) continue;

      const favoriteService = mostFrequent(entry.services);
      const favoriteStaff = mostFrequent(entry.staffs);

      const update: Record<string, unknown> = {
        last_synced_at: now,
        // Distinct from "boulevard" / "mindbody" — we want audit clarity
        // that this row was warmed from aggregate calendar data, not
        // from a platform getClientHistory pull. Future calls to
        // syncClientFromPlatform can overwrite with richer per-client data.
        sync_source: `aggregate_${entry.platform}`,
        sync_error: null,
        platform_visit_count: visitCount,
        platform_last_visit_at: lastVisit,
        favorite_service: favoriteService ?? null,
        favorite_staff: favoriteStaff ?? null,
      };

      // Identity fields: only seed when blank — staff edits in our
      // dashboard win over platform values.
      if (!profile.first_name && entry.name) {
        const [first, ...rest] = entry.name.trim().split(/\s+/);
        if (first) update.first_name = first;
        if (rest.length > 0) update.last_name = rest.join(" ");
      }
      if (!profile.last_service && favoriteService) {
        update.last_service = favoriteService;
      }
      if (!profile.last_provider && favoriteStaff) {
        update.last_provider = favoriteStaff;
      }

      const { error: upErr } = await supabaseAdmin
        .from("client_profiles")
        .update(update)
        .eq("id", profile.id);
      if (upErr) {
        console.error("RECENT_CLIENT_SYNC_UPDATE_ERR:", upErr.message);
        continue;
      }
      result.upserted++;
    }
  } catch (err) {
    result.errored = true;
    result.errorMessage = err instanceof Error ? err.message : String(err);
    console.error("RECENT_CLIENT_SYNC_ERR:", result.errorMessage);
  }

  return result;
}

// ─── Bulk pull of platform client directory ─────────────────────────────────
//
// Complements the recent-from-calendar aggregator above: that one only
// finds clients who have an appointment in the backfill window. This
// one pulls straight from the platform's client directory, so clients
// who exist in the system but haven't booked in our window — or were
// added via the front desk without ever booking — still get a profile
// row created. The AI greets them by name on a cold call instead of
// treating them as strangers.
//
// Volume control: hard cap of 2000 clients per sync (configurable via
// HARD_LIMIT). For larger directories this is a "top-recent" slice; the
// adapter's `modifiedSince` parameter narrows the server-side query to
// recently-touched records when supported (Mindbody does, e.g.).
//
// Phone is the join key. Records without a phone are pulled but skipped
// at the upsert step — we have no way to tie them to a future inbound
// call.

const DIRECTORY_HARD_LIMIT = 2000;
const DIRECTORY_MODIFIED_SINCE_DAYS = 365;

export interface ClientDirectorySyncResult {
  tenantId: string;
  fetched: number;       // total records returned by the platform
  skippedNoPhone: number; // records dropped because no phone to use as join key
  upserted: number;       // client_profiles written/updated
  errored: boolean;
  errorMessage?: string;
}

export async function syncClientDirectoryForTenant(
  tenantId: string
): Promise<ClientDirectorySyncResult> {
  const result: ClientDirectorySyncResult = {
    tenantId,
    fetched: 0,
    skippedNoPhone: 0,
    upserted: 0,
    errored: false,
  };

  try {
    const integration = await loadTenantIntegration(tenantId);
    if (!integration?.adapter?.listClients) {
      // Adapter doesn't expose a client list endpoint — silent no-op.
      return result;
    }

    const modifiedSince = new Date(
      Date.now() - DIRECTORY_MODIFIED_SINCE_DAYS * 86_400_000
    ).toISOString();

    let records: AdapterClientRecord[];
    try {
      records = await integration.adapter.listClients(integration.ctx, {
        modifiedSince,
        limit: DIRECTORY_HARD_LIMIT,
      });
    } catch (err) {
      result.errored = true;
      result.errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `CLIENT_DIRECTORY_FETCH_ERR[${integration.adapter.platform}]`,
        tenantId,
        result.errorMessage
      );
      return result;
    }

    result.fetched = records.length;
    const platform = integration.adapter.platform;
    const now = new Date().toISOString();

    for (const r of records) {
      const phone = normalizePhone(r.phone);
      if (!phone) {
        result.skippedNoPhone++;
        continue;
      }

      // ensureClientProfile is the (tenant, phone) upsert key. Returns
      // the existing profile if there is one, otherwise creates it.
      const profile = await ensureClientProfile(tenantId, phone);
      if (!profile) continue;

      const providerRefs = {
        ...((profile.provider_refs ?? {}) as Record<string, string>),
        [platform]: r.externalId,
      };

      const update: Record<string, unknown> = {
        last_synced_at: now,
        sync_source: `directory_${platform}`,
        sync_error: null,
        provider_refs: providerRefs,
      };

      // Only seed identity when blank — staff edits in the dashboard
      // win over platform values. Same policy as syncClientFromPlatform.
      if (!profile.first_name && r.firstName) update.first_name = r.firstName;
      if (!profile.last_name && r.lastName) update.last_name = r.lastName;
      if (!profile.email && r.email) update.email = r.email;

      const { error } = await supabaseAdmin
        .from("client_profiles")
        .update(update)
        .eq("id", profile.id);
      if (error) {
        console.error(
          "CLIENT_DIRECTORY_UPDATE_ERR:",
          tenantId,
          r.externalId,
          error.message
        );
        continue;
      }
      result.upserted++;
    }
  } catch (err) {
    result.errored = true;
    result.errorMessage = err instanceof Error ? err.message : String(err);
    console.error("CLIENT_DIRECTORY_SYNC_ERR:", result.errorMessage);
  }

  return result;
}
