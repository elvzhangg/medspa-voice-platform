import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  provisionBYOTwilioNumber,
  releaseVapiNumber,
} from "@/lib/twilio-provision";

export const runtime = "nodejs";
export const maxDuration = 120;

const WEBHOOK_URL =
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://medspa-voice-platform.vercel.app") +
  "/api/vapi/webhook";

function areaCodeFrom(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const stripped = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  return stripped.length >= 3 ? stripped.slice(0, 3) : null;
}

/**
 * POST /api/admin/crm/[id]/migrate-twilio
 *
 * One-click migration: existing demo/tenant has a Vapi-provisioned number
 * that we don't control (so SMS can't fire). Buy a fresh number from OUR
 * Twilio account, import it into Vapi, swap it onto the tenant row,
 * release the old Vapi-managed number.
 *
 * IMPORTANT: the phone number CHANGES. Caller must understand this — any
 * outreach already sent with the old number will hit a dead line. The UI
 * confirms before invoking.
 *
 * Safe to fail mid-flight: every step is reversible. If we buy + import
 * but the tenant patch fails, we release the new number before returning.
 * If the old release fails it's a slow-leak (a number sits on Vapi for a
 * day or two) but the migration itself succeeds.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { data: prospect } = await supabaseAdmin
    .from("crm_prospects")
    .select("id, tenant_id, business_name, phone")
    .eq("id", id)
    .maybeSingle();
  if (!prospect?.tenant_id) {
    return NextResponse.json({ error: "Prospect not activated — nothing to migrate" }, { status: 400 });
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, name, phone_number, vapi_phone_number_id, twilio_phone_number, twilio_phone_sid")
    .eq("id", prospect.tenant_id)
    .maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Tenant row missing" }, { status: 500 });

  // Already on BYO Twilio — nothing to do. Detected by having both a
  // twilio_phone_number AND a twilio_phone_sid matching the current
  // phone_number. (We don't trust just twilio_phone_number because old
  // schemas may have left a value there manually.)
  if (
    tenant.twilio_phone_sid &&
    tenant.twilio_phone_number &&
    tenant.twilio_phone_number === tenant.phone_number
  ) {
    return NextResponse.json({
      ok: true,
      already_byo: true,
      phone_number: tenant.phone_number,
    });
  }

  // Try to preserve the prospect's area-code preference (same as the
  // original provisioning). Falls through to the geo-diverse pool if
  // unavailable.
  const preferredArea =
    areaCodeFrom(tenant.phone_number as string | null) ??
    areaCodeFrom(prospect.phone as string | null);

  const provisioned = await provisionBYOTwilioNumber({
    preferredAreaCode: preferredArea,
    labelPrefix: "DEMO",
    businessName: tenant.name ?? prospect.business_name ?? "tenant",
    serverUrl: WEBHOOK_URL,
  });
  if ("error" in provisioned) {
    return NextResponse.json(
      { error: `Provision failed: ${provisioned.error}`, attempted: provisioned.attemptedAreaCodes },
      { status: 502 }
    );
  }

  const oldVapiId = tenant.vapi_phone_number_id;
  const oldNumber = tenant.phone_number;

  const { error: patchErr } = await supabaseAdmin
    .from("tenants")
    .update({
      phone_number: provisioned.phoneNumber,
      vapi_phone_number_id: provisioned.vapiPhoneNumberId,
      twilio_phone_number: provisioned.phoneNumber,
      twilio_phone_sid: provisioned.twilioSid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenant.id);
  if (patchErr) {
    // Roll back the newly-bought number so we don't leak.
    const { releaseTwilioNumber } = await import("@/lib/twilio-provision");
    await releaseVapiNumber(provisioned.vapiPhoneNumberId);
    await releaseTwilioNumber(provisioned.twilioSid);
    return NextResponse.json(
      { error: `Tenant update failed (new number released): ${patchErr.message}` },
      { status: 500 }
    );
  }

  // Release the old Vapi-managed number — fire-and-forget. If it fails,
  // we logged it but the migration is still a success from the tenant's
  // perspective.
  if (oldVapiId) await releaseVapiNumber(oldVapiId);

  return NextResponse.json({
    ok: true,
    old_number: oldNumber,
    new_number: provisioned.phoneNumber,
    vapi_phone_number_id: provisioned.vapiPhoneNumberId,
  });
}
