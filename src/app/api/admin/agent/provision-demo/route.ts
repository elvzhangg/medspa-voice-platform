import { NextRequest, NextResponse } from "next/server";
import { provisionDemoForProspect } from "@/lib/demo-provisioner";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { prospect_id } = (await req.json()) as { prospect_id?: string };
  if (!prospect_id) {
    return NextResponse.json({ error: "prospect_id required" }, { status: 400 });
  }

  const result = await provisionDemoForProspect(prospect_id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    already_provisioned: result.already_provisioned ?? false,
    tenant: { id: result.tenant_id },
    phone_number: result.phone_number,
    kb_chunks: result.kb_chunks ?? 0,
  });
}
