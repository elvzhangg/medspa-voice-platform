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
    voicemail_forwarding_number: tenant.voicemail_forwarding_number || "",
  });
}

export async function POST(req: Request) {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  // greeting_message is owned by /api/settings (clinic identity) — it's
  // returned there for read-side backwards-compat but never written, so
  // Clinic Setup can't overwrite it by accident from two sides.
  const { ai_voice_id, voicemail_forwarding_number } = body;

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({
      ai_voice_id,
      voicemail_forwarding_number,
    })
    .eq("id", tenant.id);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ success: true });
}
