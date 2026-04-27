import { supabaseAdmin } from "./supabase";
import { loadTenantIntegration } from "./integrations";
import type { AdapterProvider } from "./integrations/types";

/**
 * Keep the `staff` table in sync with whatever roster lives in the
 * tenant's connected booking platform (Boulevard/Acuity/Mindbody/etc.).
 *
 * Trigger points:
 *   1. Admin flips integration_status → 'connected' (initial sync)
 *   2. Daily cron at /api/cron/sync-providers (drift correction)
 *
 * Conflict policy:
 *   - Platform-sourced fields (name, title, services, working_hours) are
 *     OVERWRITTEN on each sync — the platform is the source of truth.
 *   - Tenant-authored fields (ai_notes, specialties) are PRESERVED — they
 *     exist purely in our DB and the platform doesn't know about them.
 *   - active flag follows the platform (re-hiring re-activates the row).
 *   - Staff that disappear from the platform aren't deleted, just marked
 *     active = false, so ai_notes survives a re-hire later.
 */

export interface SyncResult {
  tenantId: string;
  platform: string;
  fetched: number;
  upserted: number;
  deactivated: number;
  errored: boolean;
  errorMessage?: string;
}

export async function syncProvidersForTenant(tenantId: string): Promise<SyncResult> {
  const base: Omit<SyncResult, "errored"> = {
    tenantId,
    platform: "",
    fetched: 0,
    upserted: 0,
    deactivated: 0,
  };

  const integration = await loadTenantIntegration(tenantId);
  if (!integration) {
    // Internal-only or disconnected tenant — nothing to sync, not an error.
    return { ...base, platform: "internal", errored: false };
  }

  const { adapter, ctx } = integration;
  base.platform = adapter.platform;

  if (!adapter.listProviders) {
    // Adapter hasn't implemented the roster endpoint yet — skip silently.
    return { ...base, errored: false };
  }

  let providers: AdapterProvider[];
  try {
    providers = await adapter.listProviders(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`PROVIDER_SYNC_FETCH_ERR[${adapter.platform}]`, tenantId, msg);
    return { ...base, errored: true, errorMessage: msg };
  }

  base.fetched = providers.length;
  const now = new Date().toISOString();

  // Upsert each provider. We can't use a single onConflict upsert because
  // we want to preserve ai_notes/specialties on updates — so we split
  // insert vs update based on existing external_id.
  const { data: existing } = await supabaseAdmin
    .from("staff")
    .select("id, external_id")
    .eq("tenant_id", tenantId)
    .eq("external_source", adapter.platform);

  const existingByExt = new Map<string, string>();
  for (const row of existing ?? []) {
    if (row.external_id) existingByExt.set(row.external_id, row.id);
  }

  const seenExternalIds = new Set<string>();

  for (const p of providers) {
    seenExternalIds.add(p.externalId);

    const platformFields = {
      name: p.name,
      title: p.title ?? null,
      services: p.services ?? [],
      working_hours: p.workingHours ?? null,
      bio: p.bio ?? null,
      active: p.active !== false,
      last_synced_at: now,
    };

    const id = existingByExt.get(p.externalId);
    if (id) {
      // Update — do NOT touch ai_notes / specialties (tenant-authored).
      const { error } = await supabaseAdmin
        .from("staff")
        .update(platformFields)
        .eq("id", id);
      if (error) {
        console.error("PROVIDER_SYNC_UPDATE_ERR", tenantId, p.externalId, error.message);
        continue;
      }
    } else {
      // Insert — new provider we've never seen.
      const { error } = await supabaseAdmin.from("staff").insert({
        tenant_id: tenantId,
        external_source: adapter.platform,
        external_id: p.externalId,
        ...platformFields,
      });
      if (error) {
        console.error("PROVIDER_SYNC_INSERT_ERR", tenantId, p.externalId, error.message);
        continue;
      }
    }
    base.upserted++;
  }

  // Soft-deactivate rows that used to come from this platform but weren't
  // in the current roster (terminated staff). We keep them for ai_notes
  // history; if they're ever rehired, the insert-vs-update branch above
  // will reactivate by updating active=true.
  const toDeactivate: string[] = [];
  for (const [extId, rowId] of existingByExt.entries()) {
    if (!seenExternalIds.has(extId)) toDeactivate.push(rowId);
  }
  if (toDeactivate.length > 0) {
    const { error } = await supabaseAdmin
      .from("staff")
      .update({ active: false, last_synced_at: now })
      .in("id", toDeactivate);
    if (error) {
      console.error("PROVIDER_SYNC_DEACTIVATE_ERR", tenantId, error.message);
    } else {
      base.deactivated = toDeactivate.length;
    }
  }

  return { ...base, errored: false };
}

/**
 * Fan out sync across every connected tenant. Errors in one tenant don't
 * abort the rest — we log and keep going. Used by the daily cron.
 */
export async function syncProvidersForAllTenants(): Promise<SyncResult[]> {
  const { data: tenants } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("integration_status", "connected");

  const results: SyncResult[] = [];
  for (const t of tenants ?? []) {
    try {
      const res = await syncProvidersForTenant(t.id);
      results.push(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        tenantId: t.id,
        platform: "unknown",
        fetched: 0,
        upserted: 0,
        deactivated: 0,
        errored: true,
        errorMessage: msg,
      });
    }
  }
  return results;
}
