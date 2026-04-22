import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

// Canonical column is `tenants.voice_id` — this is what assistant-builder
// passes to Vapi at call time. Previously this route read/wrote a ghost
// `ai_voice_id` column that nothing downstream consumed; consolidated.

export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    greeting_message: tenant.greeting_message,
    system_prompt_override: tenant.system_prompt_override,
    voice_id: tenant.voice_id || "EXAVITQu4vr4xnSDxMaL",
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
  const { voice_id, voicemail_forwarding_number } = body;

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({
      voice_id,
      voicemail_forwarding_number,
    })
    .eq("id", tenant.id);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ success: true });
}
