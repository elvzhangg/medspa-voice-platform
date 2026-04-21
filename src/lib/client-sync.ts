import { supabaseAdmin } from "./supabase";
import { loadTenantIntegration } from "./integrations";
import { ensureClientProfile, normalizePhone } from "./client-intelligence";
import type { AdapterClientHistory } from "./integrations/types";

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
