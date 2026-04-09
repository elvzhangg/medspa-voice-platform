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
    deposit_amount: tenant.booking_config?.deposit_amount || 0,
  });
}

export async function POST(req: Request) {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, greeting_message, system_prompt_override, deposit_amount } = body;

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({
      name,
      greeting_message,
      system_prompt_override,
      booking_config: { 
        ...tenant.booking_config,
        deposit_amount 
      }
    })
    .eq("id", tenant.id);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ success: true });
}
