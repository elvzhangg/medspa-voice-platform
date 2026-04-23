import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const { data, error } = await supabaseAdmin
    .from("outreach_campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Prospect count via the membership join (source of truth for globally-unique prospects)
  const { count } = await supabaseAdmin
    .from("prospect_campaign_memberships")
    .select("prospect_id", { count: "exact", head: true })
    .eq("campaign_id", id);

  return NextResponse.json({ campaign: { ...data, prospect_count: count ?? 0 } });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from("outreach_campaigns")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
