import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runFullTenantSync } from "@/lib/appointment-sync";

/**
 * Periodic full sync across every connected tenant.
 *
 * Invoked by Vercel Cron (see vercel.json). Protected by CRON_SECRET so
 * only Vercel's cron runner can trigger it — Vercel forwards the secret
 * automatically via the Authorization header on scheduled invocations.
 *
 * Why a periodic sync at all? Manual "Sync now" only fires when a tenant
 * (or the bootstrap flow) clicks it. Without a cron, an event added
 * directly to a tenant's Google Calendar wouldn't appear in the VauxVoice
 * dashboard until someone manually triggered a sync. 15-min cadence keeps
 * the dashboard fresh enough that a med spa booking events throughout
 * the day rarely sees stale data, while staying well under platform API
 * quotas (Google Calendar's free 1M/day quota dwarfs our usage).
 *
 * Cost: zero AI tokens. Each run is HTTP polling + DB writes only.
 *
 * Provider sync used to live at /api/cron/sync-providers; that path is
 * unregistered in vercel.json (provider phase is disabled per
 * appointment-sync.ts header). This cron replaces it as the main
 * scheduled sync entry point.
 */

// Ceiling of 5 min — runFullTenantSync caps at ~30s per tenant against
// most platforms; 5 min handles 10+ tenants comfortably with serial
// execution. If we cross that, parallelize via Promise.allSettled.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  // Only sync tenants whose integration is actually connected. Pending,
  // error, and disabled tenants are skipped — there's nothing useful to
  // pull (no valid credentials) and we'd just stamp last_synced_at on a
  // broken row. They get back into rotation once they reconnect.
  const { data: tenants, error } = await supabaseAdmin
    .from("tenants")
    .select("id, name")
    .eq("integration_status", "connected");

  if (error) {
    console.error("CRON_SYNC_TENANT_LIST_ERR:", error);
    return NextResponse.json({ error: "Failed to list tenants" }, { status: 500 });
  }

  const results: Array<{
    tenantId: string;
    name: string;
    appointmentsFetched: number;
    appointmentsUpserted: number;
    errored: boolean;
    error?: string;
  }> = [];

  // Serial — keeps Vercel function memory low and platform API rates
  // sane. Parallelize if tenant count grows past ~50.
  for (const t of tenants ?? []) {
    try {
      const res = await runFullTenantSync(t.id);
      results.push({
        tenantId: t.id,
        name: t.name,
        appointmentsFetched: res.appointments.fetched,
        appointmentsUpserted: res.appointments.upserted,
        errored: res.appointments.errored,
        error: res.appointments.errorMessage,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("CRON_SYNC_TENANT_ERR:", t.id, msg);
      results.push({
        tenantId: t.id,
        name: t.name,
        appointmentsFetched: 0,
        appointmentsUpserted: 0,
        errored: true,
        error: msg,
      });
    }
  }

  const durationMs = Date.now() - started;
  const summary = {
    durationMs,
    tenantsProcessed: results.length,
    totalApptsFetched: results.reduce((n, r) => n + r.appointmentsFetched, 0),
    totalApptsUpserted: results.reduce((n, r) => n + r.appointmentsUpserted, 0),
    erroredCount: results.filter((r) => r.errored).length,
    errors: results
      .filter((r) => r.errored)
      .map((r) => ({ tenantId: r.tenantId, name: r.name, error: r.error })),
  };

  console.log("CRON_SYNC_COMPLETE:", JSON.stringify(summary));
  return NextResponse.json(summary);
}
