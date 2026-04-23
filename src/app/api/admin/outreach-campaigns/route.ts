import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("outreach_campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Campaigns GET failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Prospect counts via the membership table (source of truth with globally-unique prospects)
  const ids = (data ?? []).map((c) => c.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: rows } = await supabaseAdmin
      .from("prospect_campaign_memberships")
      .select("campaign_id")
      .in("campaign_id", ids);
    for (const row of rows ?? []) {
      counts.set(row.campaign_id, (counts.get(row.campaign_id) ?? 0) + 1);
    }
  }

  const campaigns = (data ?? []).map((c) => ({
    ...c,
    // Keep the old shape so the list page's `c.outreach_prospects?.[0]?.count` still works
    outreach_prospects: [{ count: counts.get(c.id) ?? 0 }],
  }));

  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" && body.description.trim()
    ? body.description.trim()
    : null;
  const target_regions = Array.isArray(body.target_regions) ? body.target_regions : null;
  const target_platforms = Array.isArray(body.target_platforms) ? body.target_platforms : null;

  if (!name) return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("outreach_campaigns")
    .insert({ name, description, target_regions, target_platforms, status: "active" })
    .select()
    .single();

  if (error) {
    console.error("Campaign POST failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Insert returned no row" }, { status: 500 });
  }

  return NextResponse.json({ campaign: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("outreach_campaigns")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
