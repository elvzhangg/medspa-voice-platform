import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Logging endpoint — captures raw Vapi payload and stores in call_logs
 * Then forwards to the real webhook
 */
export async function POST(req: NextRequest) {
  const rawText = await req.text();

  // Store raw payload in call_logs for inspection
  try {
    await supabaseAdmin.from("call_logs").insert({
      vapi_call_id: `log-${Date.now()}`,
      caller_number: "debug-log",
      summary: rawText.slice(0, 5000),
    });
  } catch (e) {
    console.error("Failed to log:", e);
  }

  // Forward to real webhook
  const res = await fetch(new URL("/api/vapi/webhook", req.url).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawText,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
