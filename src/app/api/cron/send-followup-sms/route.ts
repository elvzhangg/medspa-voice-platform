import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { SMS_TEMPLATES, renderTemplate } from "@/lib/sms/templates";
import { sendTwilioSms, isPhoneOptedOut } from "@/lib/sms/send";

/**
 * Post-visit aftercare SMS dispatcher.
 *
 * Scans for calendar_events that have been marked completed (manually by
 * staff or by a platform webhook) and whose tenant has configured a delay
 * that has now elapsed. For each match, renders the fixed followup wrapper
 * with the tenant's per-treatment guideline body and sends via Twilio.
 *
 * Guardrails:
 *   - Must have explicit sms_consent_granted_at on the event.
 *   - Must not be on sms_opt_outs for the tenant.
 *   - sms_sent_log UNIQUE(event, 'followup') prevents duplicate sends on
 *     overlapping cron ticks — we INSERT the log row BEFORE the send and
 *     UPDATE it with the outcome after.
 *   - Missing post_procedure_template for the service → status='skipped_no_consent'
 *     reused with error='no_template'. Tenant hasn't authored guidelines yet.
 *
 * Protected by CRON_SECRET — Vercel forwards it on scheduled runs.
 */

export const maxDuration = 300;

interface EventRow {
  id: string;
  tenant_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  service_type: string | null;
  completed_at: string;
  sms_consent_granted_at: string | null;
  sms_consent_phone: string | null;
}

interface TenantRow {
  id: string;
  name: string;
  sms_followup_enabled: boolean;
  sms_followup_hours: number;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  // Only tenants who have the feature on. Followup_hours is used to compute
  // the earliest eligible completed_at (NOW - followup_hours).
  const { data: tenants } = await supabaseAdmin
    .from("tenants")
    .select(
      "id, name, sms_followup_enabled, sms_followup_hours, twilio_account_sid, twilio_auth_token, twilio_phone_number"
    )
    .eq("sms_followup_enabled", true);

  const tenantList = (tenants ?? []) as TenantRow[];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const tenant of tenantList) {
    const delayMs = tenant.sms_followup_hours * 60 * 60 * 1000;
    const completedBefore = new Date(Date.now() - delayMs).toISOString();

    // Candidates: completed, past delay, we don't yet have a followup log row
    // for. LEFT JOIN via NOT EXISTS would be cleaner in raw SQL; Supabase JS
    // doesn't expose it so we fetch + filter in-process. Volume is bounded
    // by tick frequency × tenant size, which is fine at this scale.
    const { data: candidates, error } = await supabaseAdmin
      .from("calendar_events")
      .select(
        "id, tenant_id, customer_name, customer_phone, service_type, completed_at, sms_consent_granted_at, sms_consent_phone"
      )
      .eq("tenant_id", tenant.id)
      .eq("status", "completed")
      .lte("completed_at", completedBefore);

    if (error) {
      console.error("FOLLOWUP_CRON_FETCH_ERR:", tenant.id, error);
      continue;
    }

    for (const ev of (candidates ?? []) as EventRow[]) {
      const recipient = ev.sms_consent_phone || ev.customer_phone;

      // Try to claim this (event, followup) pair. If another tick beat us
      // to it, the unique constraint will reject — we just skip.
      const { error: claimErr } = await supabaseAdmin.from("sms_sent_log").insert({
        tenant_id: tenant.id,
        calendar_event_id: ev.id,
        template_type: "followup",
        to_phone: recipient || "",
        status: "pending",
      });
      if (claimErr) {
        // 23505 = unique_violation → already handled. Any other error we log
        // and move on; better to miss this tick than to retry in a loop.
        if (!String(claimErr.message).includes("duplicate")) {
          console.error("FOLLOWUP_CLAIM_ERR:", ev.id, claimErr);
        }
        continue;
      }

      // Consent check (explicit): must have granted timestamp.
      if (!ev.sms_consent_granted_at) {
        await finalizeLog(tenant.id, ev.id, "skipped_no_consent", null, "no_consent_on_file");
        skipped++;
        continue;
      }

      // Opt-out check (persistent across bookings).
      if (recipient && (await isPhoneOptedOut(tenant.id, recipient))) {
        await finalizeLog(tenant.id, ev.id, "skipped_opted_out", null, "phone_opted_out");
        skipped++;
        continue;
      }

      // Service → guideline lookup (case-insensitive match).
      if (!ev.service_type) {
        await finalizeLog(tenant.id, ev.id, "failed", null, "no_service_on_event");
        failed++;
        continue;
      }
      const { data: tmpl } = await supabaseAdmin
        .from("post_procedure_templates")
        .select("guideline_text")
        .eq("tenant_id", tenant.id)
        .ilike("service_name", ev.service_type)
        .eq("active", true)
        .maybeSingle();

      if (!tmpl) {
        await finalizeLog(tenant.id, ev.id, "failed", null, "no_template_for_service");
        failed++;
        continue;
      }

      const body = renderTemplate(SMS_TEMPLATES.followupWrapper, {
        Customer: ev.customer_name?.split(" ")[0] || "there",
        Clinic: tenant.name,
        Guideline: (tmpl as any).guideline_text,
      });

      if (!recipient) {
        await finalizeLog(tenant.id, ev.id, "failed", null, "no_recipient_phone");
        failed++;
        continue;
      }

      const send = await sendTwilioSms(tenant, recipient, body);
      if (send.ok) {
        await finalizeLog(tenant.id, ev.id, "sent", send.providerMessageId ?? null, null, body);
        sent++;
      } else {
        await finalizeLog(tenant.id, ev.id, "failed", null, send.error ?? "send_failed");
        failed++;
      }
    }
  }

  return NextResponse.json({
    durationMs: Date.now() - started,
    tenantsChecked: tenantList.length,
    sent,
    skipped,
    failed,
  });
}

async function finalizeLog(
  tenantId: string,
  calendarEventId: string,
  status: "sent" | "failed" | "skipped_no_consent" | "skipped_opted_out",
  providerMessageId: string | null,
  error: string | null,
  bodyPreview?: string
) {
  await supabaseAdmin
    .from("sms_sent_log")
    .update({
      status,
      provider: status === "sent" ? "twilio" : null,
      provider_message_id: providerMessageId,
      error,
      body_preview: bodyPreview ? bodyPreview.slice(0, 200) : null,
    })
    .eq("tenant_id", tenantId)
    .eq("calendar_event_id", calendarEventId)
    .eq("template_type", "followup");
}
