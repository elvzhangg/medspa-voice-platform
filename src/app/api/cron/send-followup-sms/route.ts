import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { SMS_TEMPLATES, renderTemplate, SmsTemplateType } from "@/lib/sms/templates";
import { sendTwilioSms, isPhoneOptedOut } from "@/lib/sms/send";

/**
 * Post-visit SMS dispatcher — handles two distinct templates on the same tick:
 *
 *   1. 'followup' — clinical aftercare (2/24/48h after completion).
 *      Uses the tenant's per-treatment post_procedure_templates body.
 *      Opt-in via sms_followup_enabled.
 *
 *   2. 'checkin' — one-week wellness check (168h after completion).
 *      Fixed generic template, no procedure name, no clinical content.
 *      Opt-in via sms_checkin_enabled (separate add-on).
 *
 * Both templates share the same guardrails:
 *   - Must have explicit sms_consent_granted_at on the event.
 *   - Must not be on sms_opt_outs for the tenant.
 *   - sms_sent_log UNIQUE(event, template_type) prevents duplicate sends
 *     on overlapping cron ticks — we INSERT the log row BEFORE the send
 *     and UPDATE it with the outcome after.
 *
 * Protected by CRON_SECRET — Vercel forwards it on scheduled runs.
 */

export const maxDuration = 300;

const CHECKIN_HOURS = 168;

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
  sms_checkin_enabled: boolean;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
}

interface PassStats {
  sent: number;
  skipped: number;
  failed: number;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  // Pull any tenant opted in to either feature. Per-pass filters below key
  // off the specific toggle + delay.
  const { data: tenants } = await supabaseAdmin
    .from("tenants")
    .select(
      "id, name, sms_followup_enabled, sms_followup_hours, sms_checkin_enabled, twilio_account_sid, twilio_auth_token, twilio_phone_number"
    )
    .or("sms_followup_enabled.eq.true,sms_checkin_enabled.eq.true");

  const tenantList = (tenants ?? []) as TenantRow[];
  const stats: Record<SmsTemplateType, PassStats> = {
    confirmation: { sent: 0, skipped: 0, failed: 0 },
    reminder: { sent: 0, skipped: 0, failed: 0 },
    followup: { sent: 0, skipped: 0, failed: 0 },
    checkin: { sent: 0, skipped: 0, failed: 0 },
  };

  for (const tenant of tenantList) {
    if (tenant.sms_followup_enabled) {
      await runPass({
        tenant,
        templateType: "followup",
        delayHours: tenant.sms_followup_hours,
        stats: stats.followup,
      });
    }
    if (tenant.sms_checkin_enabled) {
      await runPass({
        tenant,
        templateType: "checkin",
        delayHours: CHECKIN_HOURS,
        stats: stats.checkin,
      });
    }
  }

  return NextResponse.json({
    durationMs: Date.now() - started,
    tenantsChecked: tenantList.length,
    followup: stats.followup,
    checkin: stats.checkin,
  });
}

async function runPass(args: {
  tenant: TenantRow;
  templateType: "followup" | "checkin";
  delayHours: number;
  stats: PassStats;
}) {
  const { tenant, templateType, delayHours, stats } = args;
  const delayMs = delayHours * 60 * 60 * 1000;
  const completedBefore = new Date(Date.now() - delayMs).toISOString();

  const { data: candidates, error } = await supabaseAdmin
    .from("calendar_events")
    .select(
      "id, tenant_id, customer_name, customer_phone, service_type, completed_at, sms_consent_granted_at, sms_consent_phone"
    )
    .eq("tenant_id", tenant.id)
    .eq("status", "completed")
    .lte("completed_at", completedBefore);

  if (error) {
    console.error("FOLLOWUP_CRON_FETCH_ERR:", tenant.id, templateType, error);
    return;
  }

  for (const ev of (candidates ?? []) as EventRow[]) {
    const recipient = ev.sms_consent_phone || ev.customer_phone;

    // Claim the (event, templateType) pair first. If another tick beat us,
    // the unique constraint will reject — we just skip.
    const { error: claimErr } = await supabaseAdmin.from("sms_sent_log").insert({
      tenant_id: tenant.id,
      calendar_event_id: ev.id,
      template_type: templateType,
      to_phone: recipient || "",
      status: "pending",
    });
    if (claimErr) {
      if (!String(claimErr.message).includes("duplicate")) {
        console.error("FOLLOWUP_CLAIM_ERR:", ev.id, templateType, claimErr);
      }
      continue;
    }

    // Consent check (explicit).
    if (!ev.sms_consent_granted_at) {
      await finalizeLog(tenant.id, ev.id, templateType, "skipped_no_consent", null, "no_consent_on_file");
      stats.skipped++;
      continue;
    }

    // Opt-out check (persistent across bookings).
    if (recipient && (await isPhoneOptedOut(tenant.id, recipient))) {
      await finalizeLog(tenant.id, ev.id, templateType, "skipped_opted_out", null, "phone_opted_out");
      stats.skipped++;
      continue;
    }

    // Render body — aftercare needs a per-service guideline lookup;
    // check-in uses a fixed template with no clinical content.
    let body: string;
    if (templateType === "followup") {
      if (!ev.service_type) {
        await finalizeLog(tenant.id, ev.id, templateType, "failed", null, "no_service_on_event");
        stats.failed++;
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
        await finalizeLog(tenant.id, ev.id, templateType, "failed", null, "no_template_for_service");
        stats.failed++;
        continue;
      }
      body = renderTemplate(SMS_TEMPLATES.followupWrapper, {
        Customer: ev.customer_name?.split(" ")[0] || "there",
        Clinic: tenant.name,
        Guideline: (tmpl as { guideline_text: string }).guideline_text,
      });
    } else {
      body = renderTemplate(SMS_TEMPLATES.checkInWeek, {
        Customer: ev.customer_name?.split(" ")[0] || "there",
        Clinic: tenant.name,
      });
    }

    if (!recipient) {
      await finalizeLog(tenant.id, ev.id, templateType, "failed", null, "no_recipient_phone");
      stats.failed++;
      continue;
    }

    const send = await sendTwilioSms(tenant, recipient, body);
    if (send.ok) {
      await finalizeLog(tenant.id, ev.id, templateType, "sent", send.providerMessageId ?? null, null, body);
      stats.sent++;
    } else {
      await finalizeLog(tenant.id, ev.id, templateType, "failed", null, send.error ?? "send_failed");
      stats.failed++;
    }
  }
}

async function finalizeLog(
  tenantId: string,
  calendarEventId: string,
  templateType: "followup" | "checkin",
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
    .eq("template_type", templateType);
}
