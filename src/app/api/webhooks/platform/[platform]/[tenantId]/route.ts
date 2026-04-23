import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAdapter } from "@/lib/integrations";
import type { AdapterContext, AdapterWebhookEvent } from "@/lib/integrations/types";
import { addMinutes } from "date-fns";

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
    if (event.eventType === "appointment.completed") {
      // Two writes on completion:
      //   1) Flip the calendar_events row so the aftercare cron picks it
      //      up (same effect as a manual "Mark completed").
      //   2) Upsert a client_visits row so weekly revenue rollups have
      //      an authoritative record — the price is only present on
      //      completion, not on the earlier create/update events.
      const completedAt = new Date().toISOString();

      await supabaseAdmin
        .from("calendar_events")
        .update({
          status: "completed",
          completed_at: completedAt,
          completion_source: `webhook_${platform}`,
          last_synced_at: completedAt,
        })
        .eq("tenant_id", tenantId)
        .eq("external_source", platform)
        .eq("external_id", event.externalId);

      // Look up the client_profile_id by phone (if we have one) so the
      // client_visits row is joinable back to our intelligence layer.
      let clientProfileId: string | null = null;
      if (event.customerPhone) {
        const { data: profile } = await supabaseAdmin
          .from("client_profiles")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("phone", event.customerPhone)
          .maybeSingle();
        clientProfileId = (profile as { id: string } | null)?.id ?? null;
      }

      if (event.startTime) {
        await supabaseAdmin.from("client_visits").upsert(
          {
            tenant_id: tenantId,
            client_profile_id: clientProfileId,
            platform,
            external_id: event.externalId,
            service: event.serviceName ?? null,
            provider: event.staffName ?? null,
            price_cents: typeof event.priceCents === "number" ? event.priceCents : null,
            visit_at: event.startTime,
            status: event.platformStatus ?? "completed",
            raw: parsedBody as object | null,
            synced_at: completedAt,
          },
          { onConflict: "tenant_id,platform,external_id" }
        );
      }
    } else if (event.cancelled) {
      await supabaseAdmin
        .from("calendar_events")
        .update({ status: "cancelled", last_synced_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("external_source", platform)
        .eq("external_id", event.externalId);
    } else if (event.startTime) {
      // Upsert by (tenant, source, external_id). Partial-index on those
      // columns means an existing row is updated in place; a brand-new
      // appointment from the platform UI creates a fresh row.
      //
      // IMPORTANT: do NOT include booked_via_ai in this payload. PostgREST's
      // ON CONFLICT DO UPDATE only touches columns present in the insert,
      // so omitting it here preserves the AI-attribution flag set by
      // bookViaAdapter. Adding it back — even as `false` — would wipe the
      // attribution the instant Boulevard fires its follow-up webhook.
      const start = new Date(event.startTime);
      const end = event.endTime ? new Date(event.endTime) : addMinutes(start, 60);

      await supabaseAdmin.from("calendar_events").upsert(
        {
          tenant_id: tenantId,
          external_source: platform,
          external_id: event.externalId,
          title: event.serviceName || "Appointment",
          description: event.staffName ? `With ${event.staffName}` : null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          customer_name: event.customerName ?? null,
          customer_phone: event.customerPhone ?? null,
          service_type: event.serviceName ?? null,
          status: "confirmed",
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,external_source,external_id" }
      );
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
