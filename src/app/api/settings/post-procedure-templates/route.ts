import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

// GET — list this tenant's per-treatment aftercare guidelines, plus the
// distinct service names already seen in calendar_events so the UI can
// surface "you have appointments for X but no guideline for it yet".
export async function GET() {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: templates }, { data: serviceRows }] = await Promise.all([
    supabaseAdmin
      .from("post_procedure_templates")
      .select("id, service_name, guideline_text, active, updated_at")
      .eq("tenant_id", tenant.id)
      .order("service_name"),
    supabaseAdmin
      .from("calendar_events")
      .select("service_type")
      .eq("tenant_id", tenant.id)
      .not("service_type", "is", null),
  ]);

  const seenServices = Array.from(
    new Set((serviceRows ?? []).map((r: any) => (r.service_type ?? "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  return NextResponse.json({
    templates: templates ?? [],
    seen_services: seenServices,
  });
}

// POST — upsert a single guideline by (tenant, service_name).
export async function POST(req: Request) {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const service_name = (body.service_name ?? "").trim();
  const guideline_text = (body.guideline_text ?? "").trim();
  const active = body.active ?? true;

  if (!service_name) {
    return NextResponse.json({ error: "service_name required" }, { status: 400 });
  }
  if (!guideline_text) {
    return NextResponse.json({ error: "guideline_text required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("post_procedure_templates")
    .upsert(
      {
        tenant_id: tenant.id,
        service_name,
        guideline_text,
        active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,service_name" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

// DELETE — remove a guideline by id.
export async function DELETE(req: Request) {
  const tenant: any = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("post_procedure_templates")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
