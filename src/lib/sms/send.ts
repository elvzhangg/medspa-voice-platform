import { supabaseAdmin } from "@/lib/supabase";

// Thin wrapper over the Twilio REST API used by background senders (cron,
// webhooks) that can't rely on Vapi's in-call SMS tool. Uses per-tenant
// credentials when configured, otherwise the platform-level env vars.

interface TenantSmsCreds {
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
}

interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export async function sendTwilioSms(
  tenant: TenantSmsCreds,
  to: string,
  body: string
): Promise<SendResult> {
  const accountSid = tenant.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = tenant.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = tenant.twilio_phone_number || process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: "no_twilio_credentials" };
  }
  if (!to) return { ok: false, error: "no_recipient" };

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: fromNumber, To: to, Body: body }).toString(),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: errText.slice(0, 500) };
    }
    const payload = (await res.json()) as { sid?: string };
    return { ok: true, providerMessageId: payload.sid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// STOP-reply opt-outs are tracked per (tenant, phone). Cron must honor these
// even if the calendar_event itself carries a consent timestamp — the client
// may have revoked consent after booking.
export async function isPhoneOptedOut(tenantId: string, phone: string): Promise<boolean> {
  if (!phone) return true;
  const { data } = await supabaseAdmin
    .from("sms_opt_outs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone_number", phone)
    .maybeSingle();
  return Boolean(data);
}
