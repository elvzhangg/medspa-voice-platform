import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant: any = await getCurrentTenant();
  const { id: campaignId } = await params;

  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Fetch error" }, { status: 500 });
  return NextResponse.json({ leads: data });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant: any = await getCurrentTenant();
  const { id: campaignId } = await params;
  const { leads } = await req.json();

  const leadsWithTenant = leads.map((l: any) => ({
    ...l,
    campaign_id: campaignId,
    tenant_id: tenant.id
  }));

  const { error } = await supabaseAdmin
    .from("leads")
    .insert(leadsWithTenant);

  // Update total count on campaign
  await supabaseAdmin.rpc('increment_campaign_leads', { campaign_id: campaignId, count: leads.length });

  if (error) return NextResponse.json({ error: "Insert error" }, { status: 500 });
  return NextResponse.json({ success: true });
}
