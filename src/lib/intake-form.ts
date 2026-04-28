import { supabaseAdmin } from "./supabase";
import { sendTwilioSms, isPhoneOptedOut } from "./sms/send";

/**
 * Post-booking intake form SMS sender.
 *
 * Tenant-configured (Settings → Intake Forms): clinic supplies any
 * URL — Mindbody public form, IntakeQ, Jotform, their own portal —
 * and a one-line SMS template. This module sends that template to the
 * customer right after a booking lands.
 *
 * Platform-agnostic by design. We don't know or care which booking
 * platform produced the appointment — same code path runs whether the
 * appointment was AI-booked, walked in, or arrived via webhook.
 *
 * Idempotency: best-effort. The first call after a booking sends the
 * SMS; if the same booking later triggers another path (e.g. a webhook
 * arriving for an AI-booked appointment), we'll send a duplicate. Real
 * dedup needs a (tenant, phone, appointment_id) ledger table — not
 * worth the schema complexity for the MVP. Acceptable cost: occasional
 * duplicate SMS for the same booking (rare in practice).
 *
 * Honors STOP-reply opt-outs via isPhoneOptedOut.
 */

interface SendArgs {
  tenantId: string;
  customerName: string;
  customerPhone: string;
}

interface IntakeFormConfig {
  enabled: boolean;
  url: string;
  message: string;
}

interface TenantSmsRow {
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  booking_config: { intake_form_enabled?: boolean; intake_form_url?: string; intake_form_message?: string } | null;
}

const DEFAULT_TEMPLATE =
  "Hi {first_name}, please complete your intake form before your appointment: {link}";

function renderTemplate(template: string, vars: { first_name: string; link: string }): string {
  return template
    .replace(/\{first_name\}/g, vars.first_name)
    .replace(/\{link\}/g, vars.link);
}

export async function sendIntakeFormSms(args: SendArgs): Promise<{ ok: boolean; reason?: string }> {
  if (!args.customerPhone) return { ok: false, reason: "no_phone" };

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("twilio_account_sid, twilio_auth_token, twilio_phone_number, booking_config")
    .eq("id", args.tenantId)
    .single<TenantSmsRow>();

  if (!tenant) return { ok: false, reason: "tenant_not_found" };

  const cfg: IntakeFormConfig = {
    enabled: Boolean(tenant.booking_config?.intake_form_enabled),
    url: (tenant.booking_config?.intake_form_url || "").trim(),
    message: tenant.booking_config?.intake_form_message || DEFAULT_TEMPLATE,
  };

  if (!cfg.enabled) return { ok: false, reason: "disabled" };
  if (!cfg.url) return { ok: false, reason: "no_url" };

  // Honor STOP-reply opt-outs at the tenant level.
  const optedOut = await isPhoneOptedOut(args.tenantId, args.customerPhone);
  if (optedOut) return { ok: false, reason: "opted_out" };

  const firstName = (args.customerName || "").trim().split(/\s+/)[0] || "there";
  const body = renderTemplate(cfg.message || DEFAULT_TEMPLATE, {
    first_name: firstName,
    link: cfg.url,
  });

  const send = await sendTwilioSms(tenant, args.customerPhone, body);
  if (!send.ok) {
    console.error("INTAKE_FORM_SMS_SEND_ERR:", args.tenantId, send.error);
    return { ok: false, reason: send.error };
  }
  return { ok: true };
}
