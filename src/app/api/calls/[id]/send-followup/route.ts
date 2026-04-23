import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant, getSession } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTwilioSms, isPhoneOptedOut } from "@/lib/sms/send";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/calls/[id]/send-followup
// Sends the final tenant-approved draft to the caller via Twilio, logs it
// in sms_sent_log with template_type='winback', and writes an audit row.
// Guards:
//   - Tenant scope via RLS/auth.
//   - Opt-out check against sms_opt_outs.
//   - Ensures the draft ends with the required STOP phrase.
export async function POST(req: NextRequest, ctx: Ctx) {
  const tenant = (await getCurrentTenant()) as {
    id: string;
    name: string;
    twilio_account_sid: string | null;
    twilio_auth_token: string | null;
    twilio_phone_number: string | null;
  } | null;
  const session = await getSession();
  if (!tenant || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: callId } = await ctx.params;
  const body = (await req.json()) as { draft: string };
  const draft = (body.draft ?? "").trim();
  if (!draft) return NextResponse.json({ error: "Empty draft" }, { status: 400 });

  const { data: call } = await supabaseAdmin
    .from("call_logs")
    .select("id, caller_number, tenant_id")
    .eq("id", callId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (!call.caller_number) {
    return NextResponse.json({ error: "No caller number on file" }, { status: 400 });
  }

  if (await isPhoneOptedOut(tenant.id, call.caller_number)) {
    return NextResponse.json(
      { error: "This number has opted out of SMS from your clinic." },
      { status: 403 }
    );
  }

  // Safety net — the drafter system prompt already requires STOP, but we
  // append it if somehow missing so no message goes out non-compliant.
  const needsStopLine = !/reply\s+stop/i.test(draft);
  const finalBody = needsStopLine ? `${draft}\n\nReply STOP to opt out.` : draft;

  const send = await sendTwilioSms(tenant, call.caller_number, finalBody);

  // Log every attempt — successful or not — for audit. calendar_event_id
  // is NULL for winbacks (they're tied to a call, not a booking).
  const { error: logErr } = await supabaseAdmin.from("sms_sent_log").insert({
    tenant_id: tenant.id,
    calendar_event_id: null,
    template_type: "winback",
    to_phone: call.caller_number,
    body_preview: finalBody.slice(0, 200),
    status: send.ok ? "sent" : "failed",
    provider: send.ok ? "twilio" : null,
    provider_message_id: send.providerMessageId ?? null,
    error: send.error ?? null,
  });
  if (logErr) console.error("SEND_FOLLOWUP_LOG_ERR:", logErr);

  if (!send.ok) {
    return NextResponse.json({ error: send.error ?? "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, preview: finalBody });
}
