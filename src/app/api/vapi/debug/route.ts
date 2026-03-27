import { NextRequest, NextResponse } from "next/server";

/**
 * Debug endpoint — logs the full raw Vapi payload
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log("VAPI DEBUG PAYLOAD:", JSON.stringify(body, null, 2));

  return NextResponse.json({
    assistant: {
      name: "Debug Assistant",
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "Say: Debug mode active. Thank you for helping test." }],
      },
      voice: { provider: "11labs", voiceId: "EXAVITQu4vr4xnSDxMaL" },
      firstMessage: "Debug mode active. Thank you for calling.",
    },
  });
}
