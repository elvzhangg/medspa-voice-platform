import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("client_profiles")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("id", id)
    .maybeSingle();

  if (profErr || !profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: updates } = await supabaseAdmin
    .from("client_profile_updates")
    .select("field, old_value, new_value, source, source_detail, created_at")
    .eq("client_profile_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ profile, updates: updates ?? [] });
}

const EDITABLE_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "preferred_provider",
  "preferred_time",
  "referral_source",
  "staff_notes",
  "tags",
  "no_personalization",
] as const;

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json();

  const { data: current, error: curErr } = await supabaseAdmin
    .from("client_profiles")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("id", id)
    .maybeSingle();

  if (curErr || !current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  const auditRows: Array<Record<string, unknown>> = [];

  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    const nextRaw = body[field];
    const next =
      field === "tags"
        ? Array.isArray(nextRaw)
          ? nextRaw.map((t: string) => String(t).trim()).filter(Boolean)
          : []
        : field === "no_personalization"
        ? Boolean(nextRaw)
        : nextRaw === "" || nextRaw == null
        ? null
        : String(nextRaw);

    const cur = (current as any)[field];
    const curCompare = Array.isArray(cur) ? JSON.stringify(cur) : cur ?? null;
    const nextCompare = Array.isArray(next) ? JSON.stringify(next) : next;
    if (curCompare === nextCompare) continue;

    updates[field] = next;
    auditRows.push({
      client_profile_id: id,
      field,
      old_value: Array.isArray(cur) ? JSON.stringify(cur) : cur == null ? null : String(cur),
      new_value: Array.isArray(next) ? JSON.stringify(next) : next == null ? null : String(next),
      source: "staff_dashboard",
      source_detail: null,
    });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ profile: current, updated: false });
  }

  updates.updated_at = new Date().toISOString();
  updates.updated_by = "staff_dashboard";

  const { data: updated, error: updErr } = await supabaseAdmin
    .from("client_profiles")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (updErr) {
    console.error("CLIENT_PATCH_ERROR:", updErr);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  if (auditRows.length > 0) {
    await supabaseAdmin.from("client_profile_updates").insert(auditRows);
  }

  return NextResponse.json({ profile: updated, updated: true });
}
