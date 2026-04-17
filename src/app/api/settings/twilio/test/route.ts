import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Send a test SMS through the tenant's Twilio credentials so they can verify
 * the staff forwarding pipeline end-to-end before going live.
 *
 * Body: { to: "+1..." }  — the phone number to send the test to (usually the
 *                          owner's cell, chosen from the saved staff phones list).
 */

interface TenantWithTwilio {
  id: string;
  name?: string;
  twilio_account_sid?: string | null;
  twilio_auth_token?: string | null;
  twilio_phone_number?: string | null;
}

export async function POST(req: Request) {
  const tenant = (await getCurrentTenant()) as TenantWithTwilio | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { to } = await req.json();
  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "`to` phone number is required" }, { status: 400 });
  }

  const sid = tenant.twilio_account_sid;
  const token = tenant.twilio_auth_token;
  const from = tenant.twilio_phone_number;

  if (!sid || !token || !from) {
    return NextResponse.json(
      { error: "Connect your Twilio account first before sending a test." },
      { status: 400 }
    );
  }

  const body = `✅ Test from ${tenant.name ?? "your clinic"} — VauxVoice staff forwarding is connected. When callers request appointments, you'll get a message like this with their details. Reply STOP to opt out.`;

  const basicAuth = Buffer.from(`${sid}:${token}`).toString("base64");
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  const res = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
  });

  const ok = res.ok;
  const status = ok ? "ok" : `error_${res.status}`;
  const errText = ok ? null : (await res.text().catch(() => "")).slice(0, 300);

  // Record the attempt
  await supabaseAdmin
    .from("tenants")
    .update({
      twilio_last_test_at: new Date().toISOString(),
      twilio_last_test_status: status,
    })
    .eq("id", tenant.id);

  if (!ok) {
    return NextResponse.json({ error: `Twilio returned ${res.status}: ${errText}` }, { status: 400 });
  }
  return NextResponse.json({ success: true, sent_from: from, sent_to: to });
}
