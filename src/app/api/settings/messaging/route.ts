import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    sms_reminders_enabled: tenant.sms_reminders_enabled || false,
    sms_reminder_hours: tenant.sms_reminder_hours || 24,
    sms_reminder_template: tenant.sms_reminder_template || "",
  });
}

export async function POST(req: Request) {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { sms_reminders_enabled, sms_reminder_hours, sms_reminder_template } = body;

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({
      sms_reminders_enabled,
      sms_reminder_hours,
      sms_reminder_template,
    })
    .eq("id", tenant.id);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ success: true });
}
