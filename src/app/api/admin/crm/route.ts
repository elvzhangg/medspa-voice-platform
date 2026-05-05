import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type Stage = "top_of_funnel" | "crm" | "rejected";

const STAGE_VALUES: Stage[] = ["top_of_funnel", "crm", "rejected"];

function isStage(v: string | null): v is Stage {
  return v !== null && (STAGE_VALUES as string[]).includes(v);
}

function normalizeWebsite(website: string): string {
  return website
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

// GET /api/admin/crm?stage=top_of_funnel|crm|rejected&state=&city=&platform=&q=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stageParam = searchParams.get("stage");
  const stage: Stage = isStage(stageParam) ? stageParam : "top_of_funnel";
  const state = searchParams.get("state");
  const city = searchParams.get("city");
  const platform = searchParams.get("platform");
  const q = searchParams.get("q");

  let query = supabaseAdmin
    .from("crm_prospects")
    .select(
      "id, business_name, website, email, phone, city, state, booking_platform, research_confidence, researched_at, crm_stage, crm_promoted_at, created_at"
    )
    .eq("crm_stage", stage)
    .order("created_at", { ascending: false })
    .limit(500);

  if (state) query = query.eq("state", state);
  if (platform) query = query.eq("booking_platform", platform);
  if (city) query = query.ilike("city", `%${city}%`);
  if (q) {
    query = query.or(
      `business_name.ilike.%${q}%,website.ilike.%${q}%,email.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Facets are scoped to the stage so dropdowns don't keep shrinking as you
  // narrow filters down.
  const { data: facetRows } = await supabaseAdmin
    .from("crm_prospects")
    .select("state, booking_platform")
    .eq("crm_stage", stage)
    .limit(2000);

  const states = Array.from(
    new Set((facetRows ?? []).map((r) => r.state).filter((s): s is string => !!s))
  ).sort();
  const platforms = Array.from(
    new Set(
      (facetRows ?? [])
        .map((r) => r.booking_platform)
        .filter((p): p is string => !!p)
    )
  ).sort();

  const { data: countRows } = await supabaseAdmin
    .from("crm_prospects")
    .select("crm_stage");

  const counts: Record<Stage, number> = { top_of_funnel: 0, crm: 0, rejected: 0 };
  for (const row of countRows ?? []) {
    const s = row.crm_stage as Stage | null;
    if (s && s in counts) counts[s] += 1;
  }

  return NextResponse.json({
    prospects: data ?? [],
    facets: { states, platforms },
    counts,
  });
}

// POST /api/admin/crm — manual add. Dedupes on website if one is provided.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const business_name: string | undefined = body.business_name?.trim();
  if (!business_name) {
    return NextResponse.json({ error: "business_name required" }, { status: 400 });
  }

  const website: string | null = body.website?.trim() || null;
  if (website) {
    const normalized = normalizeWebsite(website);
    const { data: existing } = await supabaseAdmin
      .from("crm_prospects")
      .select("id, crm_stage")
      .eq("website_normalized", normalized)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { prospect: existing, deduped: true },
        { status: 200 }
      );
    }
  }

  const insert = {
    business_name,
    website,
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    city: body.city?.trim() || null,
    state: body.state?.trim() || null,
    booking_platform: body.booking_platform?.trim() || null,
    services_summary: body.services_summary?.trim() || null,
    notes: body.notes?.trim() || null,
    crm_stage: "top_of_funnel" as const,
  };

  const { data, error } = await supabaseAdmin
    .from("crm_prospects")
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospect: data });
}

// PATCH /api/admin/crm — bulk move between stages.
// Body: { ids: string[], crm_stage: Stage, actor?: string }
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const stage = body.crm_stage;
  const actor: string | undefined = body.actor;

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  if (!isStage(stage)) {
    return NextResponse.json({ error: "invalid crm_stage" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    crm_stage: stage,
    updated_at: new Date().toISOString(),
  };
  if (stage === "crm") {
    updates.crm_promoted_at = new Date().toISOString();
    if (actor) updates.crm_promoted_by = actor;
  } else {
    // Clear the promotion stamp when leaving the CRM so a re-promote stamps fresh.
    updates.crm_promoted_at = null;
    updates.crm_promoted_by = null;
  }

  const { data, error } = await supabaseAdmin
    .from("crm_prospects")
    .update(updates)
    .in("id", ids)
    .select("id, crm_stage");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: data ?? [], count: data?.length ?? 0 });
}
