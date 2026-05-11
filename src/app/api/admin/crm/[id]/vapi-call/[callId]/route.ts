import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const VAPI_API_KEY = process.env.VAPI_API_KEY!;

// GET /api/admin/crm/[id]/vapi-call/[callId]
//
// Full Vapi call record for one call id. Used to drill into a failed call
// when /vapi-calls shows it ended without audio — look at provider responses,
// transcript, and any analysis fields to see whether OpenAI or 11labs failed.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; callId: string }> }
) {
  const { callId } = await ctx.params;
  const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Vapi /call/${callId} returned ${res.status}: ${text.slice(0, 500)}` },
      { status: 500 }
    );
  }
  return NextResponse.json(await res.json());
}
