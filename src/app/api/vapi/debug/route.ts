import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Debug endpoint — logs the full raw Vapi payload to Supabase
 * Point a Vapi number's serverUrl here temporarily to capture the real payload shape
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log("VAPI DEBUG PAYLOAD:", JSON.stringify(body, null, 2));

  // Also store in DB for easy retrieval
  await supabaseAdmin.from("call_logs").insert({
    vapi_call_id: body?.message?.call?.id ?? `debug-${Date.now()}`,
    caller_number: "debug",
    summary: JSON.stringify(body).slice(0, 5000),
  }).catch(() => {}); // ignore errors

  // Return a valid assistant so the call doesn't fail
  return NextResponse.json({
    assistant: {
      name: "Debug Assistant",
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "Say: Debug mode active. Thank you for helping test." }],
      },
      voice: { provider: "11labs", voiceId: "EXAVITQu4vr4xnSDxMaL" },
      firstMessage: "Debug mode. I received your call. Thank you.",
    },
  });
}
