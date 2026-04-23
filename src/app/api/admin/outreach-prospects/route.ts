import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaign_id = searchParams.get("campaign_id");

  if (campaign_id) {
    // Campaign-scoped list: join through prospect_campaign_memberships so prospects
    // that belong to multiple campaigns still appear under each one.
    const { data: memberships, error: mErr } = await supabaseAdmin
      .from("prospect_campaign_memberships")
      .select("prospect_id, added_at")
      .eq("campaign_id", campaign_id);

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    const prospectIds = (memberships ?? []).map((m) => m.prospect_id);
    if (prospectIds.length === 0) return NextResponse.json({ prospects: [] });

    const { data, error } = await supabaseAdmin
      .from("outreach_prospects")
      .select("*")
      .in("id", prospectIds)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prospects: data ?? [] });
  }

  // Global list
  const { data, error } = await supabaseAdmin
    .from("outreach_prospects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospects: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { campaign_id, business_name, website } = body;

  if (!campaign_id || !business_name) {
    return NextResponse.json({ error: "campaign_id and business_name required" }, { status: 400 });
  }

  // Global dedup check — if a prospect with this normalized website already exists,
  // just add it to the campaign (via membership) instead of creating a duplicate.
  if (website) {
    const normalized = String(website)
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "");

    const { data: existing } = await supabaseAdmin
      .from("outreach_prospects")
      .select("id")
      .eq("website_normalized", normalized)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("prospect_campaign_memberships")
        .upsert({ prospect_id: existing.id, campaign_id });
      return NextResponse.json({ prospect: existing, deduped: true });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("outreach_prospects")
    .insert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin
    .from("prospect_campaign_memberships")
    .upsert({ prospect_id: data.id, campaign_id });

  return NextResponse.json({ prospect: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (updates.status === "contacted" && !updates.contacted_at) {
    updates.contacted_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from("outreach_prospects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospect: data });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("outreach_prospects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
