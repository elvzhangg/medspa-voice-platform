import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    greeting_message: tenant.greeting_message,
    system_prompt_override: tenant.system_prompt_override,
    ai_voice_id: tenant.ai_voice_id || "rachel",
    call_recording_enabled: tenant.call_recording_enabled ?? true,
    voicemail_forwarding_number: tenant.voicemail_forwarding_number || "",
  });
}

export async function POST(req: Request) {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { greeting_message, ai_voice_id, call_recording_enabled, voicemail_forwarding_number } = body;

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({
      greeting_message,
      ai_voice_id,
      call_recording_enabled,
      voicemail_forwarding_number,
    })
    .eq("id", tenant.id);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ success: true });
}
