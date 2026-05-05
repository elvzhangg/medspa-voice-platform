import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAdapter } from "@/lib/integrations";
import type {
  AdapterAppointment,
  AdapterContext,
  AdapterWebhookEvent,
} from "@/lib/integrations/types";
import { upsertPlatformAppointment } from "@/lib/appointment-sync";

/**
 * Inbound webhook listener — the OTHER half of the integration.
 *
 * Booking platforms POST here when an appointment is created, updated,
 * cancelled, or rescheduled outside VauxVoice (front-desk walk-ins,
 * staff edits in the platform UI). We verify the signature via the
 * platform's adapter, then upsert into calendar_events so our internal
 * availability view reflects reality on the next call.
 *
 * URL shape (tenant-scoped so we can route without parsing the body):
 *   POST /api/webhooks/platform/:platform/:tenantId
 *
 * The admin configures this URL in the platform's webhook settings,
 * pairing it with the webhook_secret we store on tenant_integrations.
 *
 * Response policy:
 *   - 200 on anything we successfully logged (even if we chose to ignore
 *     the event type) — platforms retry aggressively on non-2xx.
 *   - 401 when signature verification fails.
 *   - 404 when tenant/integration/adapter isn't found.
 */

type Ctx = { params: Promise<{ platform: string; tenantId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { platform, tenantId } = await params;

  const adapter = getAdapter(platform);
  if (!adapter?.parseWebhookEvent) {
    // No adapter for this platform (or it doesn't support webhooks yet)
    return NextResponse.json({ ok: false, error: "Unsupported platform" }, { status: 404 });
  }

  const { data: row } = await supabaseAdmin
    .from("tenant_integrations")
    .select("credentials, config")
    .eq("tenant_id", tenantId)
    .eq("platform", platform)
    .maybeSingle();
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "No integration configured for tenant" },
      { status: 404 }
    );
  }

  const ctx: AdapterContext = {
    credentials: (row.credentials ?? {}) as Record<string, string | undefined>,
    config: (row.config ?? {}) as Record<string, string | undefined>,
  };

  // Raw body + headers — adapter needs both for HMAC.
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  let event: AdapterWebhookEvent | null = null;
  let parseError: string | null = null;
  try {
    event = await adapter.parseWebhookEvent(ctx, { headers, rawBody });
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  // Audit log — write the raw event regardless of outcome so we can
  // debug signature failures and unknown event types from the admin UI.
  let parsedBody: unknown = null;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsedBody = { _raw: rawBody.slice(0, 2000) };
  }
  const { data: auditInsert } = await supabaseAdmin
    .from("platform_webhook_events")
    .insert({
      tenant_id: tenantId,
      platform,
      event_type: event?.eventType ?? null,
      external_id: event?.externalId ?? null,
      signature_ok: event?.signatureOk ?? false,
      processed: false,
      processing_error: parseError,
      raw_headers: headers,
      raw_body: parsedBody,
    })
    .select("id")
    .single();
  const auditId = auditInsert?.id as string | undefined;

  await supabaseAdmin
    .from("tenant_integrations")
    .update({ webhook_last_received_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("platform", platform);

  if (!event) {
    // Ping / unknown event — return 200 so the platform doesn't retry.
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!event.signatureOk) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  try {
    // Normalize the webhook event onto our unified appointment shape and
    // hand off to the shared writer (used by both the webhook path and
    // the manual-backfill "Sync now" path). Drop events that don't
    // resolve to a write target.
    const appt = normalizeWebhookEvent(event);
    if (appt) {
      await upsertPlatformAppointment(tenantId, platform, appt, {
        rawPayload: parsedBody,
        completionSource: `webhook_${platform}`,
      });
    }

    if (auditId) {
      await supabaseAdmin
        .from("platform_webhook_events")
        .update({ processed: true })
        .eq("id", auditId);
    }

    return NextResponse.json({ ok: true, eventType: event.eventType });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("WEBHOOK_PROCESS_ERR:", detail);
    if (auditId) {
      await supabaseAdmin
        .from("platform_webhook_events")
        .update({ processing_error: detail.slice(0, 500) })
        .eq("id", auditId);
    }
    // Return 200 anyway — the event is logged; retrying won't help.
    return NextResponse.json({ ok: false, error: "processing failed" });
  }
}

/**
 * Map an inbound webhook event onto our unified appointment shape. The
 * three event flavors collapse to three statuses:
 *   appointment.completed → status="completed"
 *   anything with `cancelled=true` → status="cancelled"
 *   create / update / reschedule with a startTime → status="confirmed"
 * Returns null when there's nothing actionable (e.g. a confirmed event
 * that arrived without a startTime — we have nothing to put on the
 * calendar).
 */
function normalizeWebhookEvent(event: AdapterWebhookEvent): AdapterAppointment | null {
  let status: AdapterAppointment["status"];
  if (event.eventType === "appointment.completed") {
    status = "completed";
  } else if (event.cancelled) {
    status = "cancelled";
  } else if (event.startTime) {
    status = "confirmed";
  } else {
    return null;
  }
  return {
    externalId: event.externalId,
    startTime: event.startTime,
    endTime: event.endTime,
    serviceName: event.serviceName,
    staffName: event.staffName,
    customerName: event.customerName,
    customerPhone: event.customerPhone,
    status,
    priceCents: event.priceCents,
    platformStatus: event.platformStatus,
  };
}
