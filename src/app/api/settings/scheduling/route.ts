import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

const DEFAULT_TEMPLATE = `📋 New booking request via AI receptionist

Patient: [CustomerName]
Phone: [CustomerPhone]
Service: [Service]
Requested: [DateTime]
Backup slots: [BackupSlots]
Time preference: [TimePreference]
Provider preference: [ProviderPreference]
Notes: [Notes]

Please text or call to confirm their appointment.
— [ClinicName] VauxVoice`;

export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    booking_forward_enabled: tenant.booking_forward_enabled ?? false,
    booking_forward_phones: tenant.booking_forward_phones ?? [],
    booking_forward_sms_template: tenant.booking_forward_sms_template || DEFAULT_TEMPLATE,
  });
}

export async function POST(req: Request) {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    booking_forward_enabled,
    booking_forward_phones,
    booking_forward_sms_template,
  } = body;

  // Sanitize phone numbers — only keep non-empty strings
  const phones: string[] = Array.isArray(booking_forward_phones)
    ? booking_forward_phones.map((p: string) => p.trim()).filter(Boolean)
    : [];

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({
      booking_forward_enabled: Boolean(booking_forward_enabled),
      booking_forward_phones: phones,
      booking_forward_sms_template: booking_forward_sms_template || DEFAULT_TEMPLATE,
    })
    .eq("id", tenant.id);

  if (error) {
    console.error("SCHEDULING_UPDATE_ERROR:", error);
    return NextResponse.json({ error: "Failed to update scheduling settings" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
