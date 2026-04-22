import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Per-tenant Twilio credentials management.
 *
 * GET    → returns the tenant's current Twilio connection status. The
 *          auth_token is NEVER returned — only a boolean indicating whether it's set.
 * POST   → save / update the tenant's Twilio credentials.
 * DELETE → disconnect (clear credentials; platform fallback takes over).
 *
 * The same Twilio number acts as BOTH the inbound AI Clientele Specialist line
 * (wired via Vapi BYO Twilio) AND the outbound SMS sender for booking
 * forward notifications. One number, one credential set, maximum trust.
 */

interface TenantWithTwilio {
  id: string;
  twilio_account_sid?: string | null;
  twilio_auth_token?: string | null;
  twilio_phone_number?: string | null;
  twilio_connected_at?: string | null;
  twilio_last_test_at?: string | null;
  twilio_last_test_status?: string | null;
}

function maskSid(sid?: string | null): string | null {
  if (!sid) return null;
  if (sid.length < 8) return "••••";
  return `${sid.slice(0, 4)}••••${sid.slice(-4)}`;
}

export async function GET() {
  const tenant = (await getCurrentTenant()) as TenantWithTwilio | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    connected: Boolean(tenant.twilio_account_sid && tenant.twilio_auth_token && tenant.twilio_phone_number),
    account_sid_masked: maskSid(tenant.twilio_account_sid),
    phone_number: tenant.twilio_phone_number ?? null,
    auth_token_set: Boolean(tenant.twilio_auth_token),
    connected_at: tenant.twilio_connected_at ?? null,
    last_test_at: tenant.twilio_last_test_at ?? null,
    last_test_status: tenant.twilio_last_test_status ?? null,
  });
}

export async function POST(req: Request) {
  const tenant = (await getCurrentTenant()) as TenantWithTwilio | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const accountSid = String(body.account_sid ?? "").trim();
  const authToken = String(body.auth_token ?? "").trim();
  const phoneNumber = String(body.phone_number ?? "").trim();

  if (!accountSid || !authToken || !phoneNumber) {
    return NextResponse.json(
      { error: "account_sid, auth_token, and phone_number are all required" },
      { status: 400 }
    );
  }

  // Light sanity checks — Twilio SIDs start with AC, auth tokens are 32+ hex
  if (!accountSid.startsWith("AC") || accountSid.length < 34) {
    return NextResponse.json({ error: "Account SID looks invalid — should start with 'AC' and be 34 characters." }, { status: 400 });
  }
  if (authToken.length < 20) {
    return NextResponse.json({ error: "Auth token looks too short." }, { status: 400 });
  }
  // Normalize phone to E.164
  const digits = phoneNumber.replace(/\D/g, "");
  const e164 = phoneNumber.startsWith("+") ? `+${digits}` : digits.length === 10 ? `+1${digits}` : `+${digits}`;

  // Validate credentials by hitting Twilio's own account endpoint
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const verifyRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  if (!verifyRes.ok) {
    const errText = await verifyRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Twilio rejected these credentials. ${verifyRes.status === 401 ? "Double-check the Account SID and Auth Token." : errText.slice(0, 200)}` },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({
      twilio_account_sid: accountSid,
      twilio_auth_token: authToken,
      twilio_phone_number: e164,
      twilio_connected_at: new Date().toISOString(),
    })
    .eq("id", tenant.id);

  if (error) {
    console.error("TWILIO_CONFIG_SAVE_ERROR:", error);
    return NextResponse.json({ error: "Failed to save Twilio credentials" }, { status: 500 });
  }

  return NextResponse.json({ success: true, phone_number: e164 });
}

export async function DELETE() {
  const tenant = (await getCurrentTenant()) as TenantWithTwilio | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({
      twilio_account_sid: null,
      twilio_auth_token: null,
      twilio_phone_number: null,
      twilio_connected_at: null,
    })
    .eq("id", tenant.id);

  if (error) {
    return NextResponse.json({ error: "Failed to disconnect Twilio" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
