import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    name: tenant.name,
    greeting_message: tenant.greeting_message,
    system_prompt_override: tenant.system_prompt_override,
    deposit_enabled: tenant.booking_config?.deposit_enabled ?? false,
    deposit_amount: tenant.booking_config?.deposit_amount || 0,
    payment_policy_notes: tenant.booking_config?.payment_policy_notes || "",
    membership_enabled: tenant.booking_config?.membership_enabled ?? false,
    membership_details: tenant.booking_config?.membership_details || "",
    membership_signup_url: tenant.booking_config?.membership_signup_url || "",
    directions_parking_info: tenant.directions_parking_info || "",
  });
}

export async function POST(req: Request) {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    name,
    greeting_message,
    system_prompt_override,
    deposit_enabled,
    deposit_amount,
    payment_policy_notes,
    membership_enabled,
    membership_details,
    membership_signup_url,
    directions_parking_info,
  } = body;

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({
      name,
      greeting_message,
      system_prompt_override,
      directions_parking_info,
      booking_config: {
        ...tenant.booking_config,
        deposit_enabled,
        deposit_amount,
        payment_policy_notes,
        membership_enabled,
        membership_details,
        membership_signup_url,
      },
    })
    .eq("id", tenant.id);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ success: true });
}
