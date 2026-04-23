import { NextRequest, NextResponse } from "next/server";
import { draftEmailForProspect } from "@/lib/email-drafter";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { prospect_id, free_trial_hint } = (await req.json()) as {
    prospect_id?: string;
    free_trial_hint?: boolean;
  };

  if (!prospect_id) {
    return NextResponse.json({ error: "prospect_id required" }, { status: 400 });
  }

  const result = await draftEmailForProspect(prospect_id, { free_trial_hint });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, raw: result.raw },
      { status: result.error === "Prospect not found" ? 404 : 422 }
    );
  }

  return NextResponse.json({ ok: true, subject: result.subject, body: result.body });
}
