import { NextRequest, NextResponse } from "next/server";
import { enqueueMessage } from "@/lib/agent-message-queue";

export const runtime = "nodejs";

/**
 * Operator-to-agent messaging. While a research run is streaming, the admin can
 * POST a message here; the agent loop will pick it up at its next iteration
 * boundary and fold it into the conversation as a user turn. Lets the operator
 * unstick the agent (e.g. "skip verification_notes", "stop trying that one")
 * without aborting the whole run.
 */
export async function POST(req: NextRequest) {
  const { campaign_id, message } = await req.json();

  if (!campaign_id || typeof campaign_id !== "string") {
    return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  enqueueMessage(campaign_id, message);
  return NextResponse.json({ ok: true });
}
