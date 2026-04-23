import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

// Templates are fixed in code (src/lib/sms/templates.ts) for HIPAA-compliant
// copy — only on/off toggles and delay timing are tenant-configurable.
export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    sms_confirmation_enabled: tenant.sms_confirmation_enabled ?? true,
    sms_reminders_enabled: tenant.sms_reminders_enabled || false,
    sms_reminder_hours: tenant.sms_reminder_hours || 24,
    sms_followup_enabled: tenant.sms_followup_enabled || false,
    sms_followup_hours: tenant.sms_followup_hours || 24,
    sms_checkin_enabled: tenant.sms_checkin_enabled || false,
    integration_platform: tenant.integration_platform || null,
    integration_mode: tenant.integration_mode || null,
  });
}

export async function POST(req: Request) {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    sms_confirmation_enabled,
    sms_reminders_enabled,
    sms_reminder_hours,
    sms_followup_enabled,
    sms_followup_hours,
    sms_checkin_enabled,
  } = body;

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({
      sms_confirmation_enabled,
      sms_reminders_enabled,
      sms_reminder_hours,
      sms_followup_enabled,
      sms_followup_hours,
      sms_checkin_enabled,
    })
    .eq("id", tenant.id);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ success: true });
}
