import { NextRequest, NextResponse } from "next/server";
import { syncProvidersForAllTenants } from "@/lib/provider-sync";

/**
 * Daily roster sync across every connected tenant.
 *
 * Invoked by Vercel Cron (see vercel.json). Protected by CRON_SECRET so
 * only Vercel's cron runner can trigger it — Vercel forwards the secret
 * automatically via the Authorization header on scheduled invocations.
 *
 * Why a cron and not webhooks? Only Boulevard pushes staff change events
 * among our platforms; the others require polling to catch new hires,
 * terminations, or schedule changes. Once a day keeps rosters accurate
 * without hammering platform APIs.
 */

export const maxDuration = 300; // Vercel Pro: up to 300s for cron jobs

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const results = await syncProvidersForAllTenants();
  const durationMs = Date.now() - started;

  const summary = {
    durationMs,
    tenantsProcessed: results.length,
    totalUpserted: results.reduce((n, r) => n + r.upserted, 0),
    totalDeactivated: results.reduce((n, r) => n + r.deactivated, 0),
    errored: results.filter((r) => r.errored).length,
    errors: results
      .filter((r) => r.errored)
      .map((r) => ({ tenantId: r.tenantId, platform: r.platform, error: r.errorMessage })),
  };

  console.log("CRON_SYNC_PROVIDERS:", JSON.stringify(summary));
  return NextResponse.json(summary);
}
