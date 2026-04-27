import { addMinutes } from "date-fns";
import { supabaseAdmin } from "./supabase";
import { loadTenantIntegration } from "./integrations";
import { syncProvidersForTenant, type SyncResult as ProviderSyncResult } from "./provider-sync";
import type { AdapterAppointment } from "./integrations/types";

/**
 * Two responsibilities here:
 *
 *   1. upsertPlatformAppointment — the single write path into
 *      calendar_events for any platform-sourced appointment. Both the
 *      inbound webhook handler and the manual "Sync now" backfill funnel
 *      through this function so the matrix of (status × existing AI row
 *      × completion side-effects) only has one implementation.
 *
 *   2. syncAppointmentsForTenant — pull-style backfill that calls the
 *      adapter's listAppointments over a date range and feeds each row
 *      to the upsert. Acts as a webhook safety net: dropped events,
 *      unsigned events, and "before we set up the webhook" history all
 *      get reconciled here.
 *
 * Conflict policy (must mirror the webhook handler's old inline logic):
 *   - Upsert by (tenant_id, external_source, external_id).
 *   - NEVER include booked_via_ai in the payload — preserves the AI flag
 *     set by booking.ts on AI-driven creates. Wiping it would break the
 *     Revenue card's AI-vs-walkin attribution.
 *   - On status="completed", also upsert client_visits (lifetime value
 *     rollup needs the price snapshot at completion time).
 */

export interface UpsertOptions {
  /** Stash on client_visits.raw when status = completed. */
  rawPayload?: unknown;
  /**
   * Source label written into calendar_events.completion_source on
   * completion. Defaults to `webhook_<platform>`; backfills should pass
   * `backfill_<platform>` so we can tell the two paths apart in audit.
   */
  completionSource?: string;
}

/**
 * Idempotent upsert for one platform-sourced appointment. Returns true
 * if a row was written (insert or update), false if we skipped (e.g. a
 * cancelled event we've never seen — there's nothing to cancel).
 */
export async function upsertPlatformAppointment(
  tenantId: string,
  platform: string,
  appt: AdapterAppointment,
  opts: UpsertOptions = {}
): Promise<boolean> {
  const now = new Date().toISOString();

  if (appt.status === "completed") {
    const completedAt = now;
    const source = opts.completionSource ?? `webhook_${platform}`;

    const { error: upErr } = await supabaseAdmin
      .from("calendar_events")
      .update({
        status: "completed",
        completed_at: completedAt,
        completion_source: source,
        last_synced_at: completedAt,
      })
      .eq("tenant_id", tenantId)
      .eq("external_source", platform)
      .eq("external_id", appt.externalId);
    if (upErr) {
      console.error("APPT_SYNC_COMPLETE_UPDATE_ERR:", upErr.message);
    }

    // Mirror the webhook handler: client_visits is the source of truth
    // for revenue rollups. We need the visit row even if calendar_events
    // never had one (e.g. backfill of a completion we missed entirely).
    let clientProfileId: string | null = null;
    if (appt.customerPhone) {
      const { data: profile } = await supabaseAdmin
        .from("client_profiles")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("phone", appt.customerPhone)
        .maybeSingle();
      clientProfileId = (profile as { id: string } | null)?.id ?? null;
    }

    if (appt.startTime) {
      const { error: vErr } = await supabaseAdmin.from("client_visits").upsert(
        {
          tenant_id: tenantId,
          client_profile_id: clientProfileId,
          platform,
          external_id: appt.externalId,
          service: appt.serviceName ?? null,
          provider: appt.staffName ?? null,
          price_cents: typeof appt.priceCents === "number" ? appt.priceCents : null,
          visit_at: appt.startTime,
          status: appt.platformStatus ?? "completed",
          raw: (opts.rawPayload as object | null) ?? null,
          synced_at: completedAt,
        },
        { onConflict: "tenant_id,platform,external_id" }
      );
      if (vErr) {
        console.error("APPT_SYNC_VISIT_UPSERT_ERR:", vErr.message);
      }
    }
    return true;
  }

  if (appt.status === "cancelled") {
    // Cancellation only flips an existing row — we don't manufacture
    // calendar_events rows for cancellations we never saw the create for.
    const { error } = await supabaseAdmin
      .from("calendar_events")
      .update({ status: "cancelled", last_synced_at: now })
      .eq("tenant_id", tenantId)
      .eq("external_source", platform)
      .eq("external_id", appt.externalId);
    if (error) console.error("APPT_SYNC_CANCEL_UPDATE_ERR:", error.message);
    return true;
  }

  // status === "confirmed"
  if (!appt.startTime) return false;

  const start = new Date(appt.startTime);
  const endTime = appt.endTime ? new Date(appt.endTime) : addMinutes(start, 60);

  // IMPORTANT: do not include booked_via_ai. Postgres' ON CONFLICT DO
  // UPDATE only touches columns present in the insert payload, so
  // omitting it here preserves the AI-attribution flag set by
  // booking.ts when the same appointment was booked via the AI agent.
  const { error } = await supabaseAdmin.from("calendar_events").upsert(
    {
      tenant_id: tenantId,
      external_source: platform,
      external_id: appt.externalId,
      title: appt.serviceName || "Appointment",
      description: appt.staffName ? `With ${appt.staffName}` : null,
      start_time: start.toISOString(),
      end_time: endTime.toISOString(),
      customer_name: appt.customerName ?? null,
      customer_phone: appt.customerPhone ?? null,
      service_type: appt.serviceName ?? null,
      status: "confirmed",
      last_synced_at: now,
    },
    { onConflict: "tenant_id,external_source,external_id" }
  );
  if (error) console.error("APPT_SYNC_UPSERT_ERR:", error.message);
  return true;
}

export interface AppointmentSyncResult {
  tenantId: string;
  platform: string;
  fetched: number;
  upserted: number;
  errored: boolean;
  errorMessage?: string;
}

/**
 * Pull every appointment in [since, until] from the platform and reconcile
 * into calendar_events. Used by the manual "Sync now" button.
 *
 * Adapters without listAppointments are skipped silently — the sync
 * still succeeds, just with fetched=0.
 */
export async function syncAppointmentsForTenant(
  tenantId: string,
  opts: { since: string; until: string }
): Promise<AppointmentSyncResult> {
  const base: Omit<AppointmentSyncResult, "errored"> = {
    tenantId,
    platform: "",
    fetched: 0,
    upserted: 0,
  };

  const integration = await loadTenantIntegration(tenantId);
  if (!integration) {
    return { ...base, platform: "internal", errored: false };
  }

  const { adapter, ctx } = integration;
  base.platform = adapter.platform;

  if (!adapter.listAppointments) {
    return { ...base, errored: false };
  }

  let appts: AdapterAppointment[];
  try {
    appts = await adapter.listAppointments(ctx, opts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`APPT_SYNC_FETCH_ERR[${adapter.platform}]`, tenantId, msg);
    return { ...base, errored: true, errorMessage: msg };
  }

  base.fetched = appts.length;

  for (const appt of appts) {
    try {
      const wrote = await upsertPlatformAppointment(tenantId, adapter.platform, appt, {
        completionSource: `backfill_${adapter.platform}`,
      });
      if (wrote) base.upserted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("APPT_SYNC_UPSERT_LOOP_ERR:", tenantId, appt.externalId, msg);
    }
  }

  return { ...base, errored: false };
}

export interface FullSyncResult {
  syncedAt: string;
  providers: ProviderSyncResult;
  appointments: AppointmentSyncResult;
}

/**
 * The single "do a full reconciliation" entry point. All four trigger
 * paths converge here:
 *   1. Admin flips integration_status → 'connected' (initial sync)
 *   2. Admin runs the test-connection button (re-test = re-sync)
 *   3. Tenant clicks "Sync now" on the calendar page
 *   4. Dashboard bootstrap (any tenant in connected-but-never-synced —
 *      catches SQL bootstraps, dev seeds, failed initial syncs).
 *
 * Always bumps tenant_integrations.last_synced_at — even on partial
 * failure — so the bootstrap path doesn't infinite-retry on every
 * dashboard load. If you genuinely want to retry, click "Sync now".
 *
 * Sequential (provider then appointment) so a flaky platform doesn't
 * double-load itself; both phases share the same staff token cache via
 * adapter context.
 */
export async function runFullTenantSync(tenantId: string): Promise<FullSyncResult> {
  const nowMs = Date.now();
  const since = new Date(nowMs - 30 * 86_400_000).toISOString();
  const until = new Date(nowMs + 90 * 86_400_000).toISOString();

  const providers = await syncProvidersForTenant(tenantId);
  const appointments = await syncAppointmentsForTenant(tenantId, { since, until });

  const syncedAt = new Date().toISOString();
  await supabaseAdmin
    .from("tenant_integrations")
    .update({ last_synced_at: syncedAt })
    .eq("tenant_id", tenantId);

  return { syncedAt, providers, appointments };
}
