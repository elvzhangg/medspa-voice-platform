import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Default payment methods — every method is off until the tenant enables
 * it. Stripe Connect is the only one actually wired for on-call payment
 * link creation (via the create_payment_link AI tool); the rest are
 * informational / link-texting (AI mentions them and can SMS a link).
 */
const DEFAULT_PAYMENT_METHODS = {
  stripe: { enabled: true },
  square: { enabled: false, payment_link_url: "" },
  paypal: { enabled: false, handle: "" },
  venmo: { enabled: false, handle: "" },
  zelle: { enabled: false, handle: "" },
  cash: { enabled: false },
  care_credit: { enabled: false, application_url: "" },
  cherry: { enabled: false, application_url: "" },
};

export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    name: tenant.name,
    greeting_message: tenant.greeting_message,
    system_prompt_override: tenant.system_prompt_override,
    deposit_enabled: tenant.booking_config?.deposit_enabled ?? false,
    deposit_amount: tenant.booking_config?.deposit_amount || 0,
    deposit_by_service: tenant.booking_config?.deposit_by_service ?? [],
    payment_methods: tenant.booking_config?.payment_methods ?? DEFAULT_PAYMENT_METHODS,
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
    deposit_by_service,
    payment_methods,
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
        deposit_by_service: Array.isArray(deposit_by_service)
          ? deposit_by_service.filter(
              (r: any) => r && typeof r.service === "string" && r.service.trim() && Number(r.amount) > 0
            )
          : [],
        payment_methods,
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
