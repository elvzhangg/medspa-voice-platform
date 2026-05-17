import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/services — list this tenant's services, grouped by display_order,
// active first. The dashboard page does its own category grouping client-side.
export async function GET() {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("tenant_services")
    .select(
      "id, name, description, category, duration_min, price_display, price_cents, active, display_order, source, source_filename, created_at, updated_at"
    )
    .eq("tenant_id", (tenant as any).id)
    .order("active", { ascending: false })
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[services] list failed", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
  return NextResponse.json({ services: data ?? [] });
}

interface ServiceInput {
  name?: string;
  description?: string | null;
  category?: string | null;
  duration_min?: number | null;
  price_display?: string | null;
  price_cents?: number | null;
  active?: boolean;
  display_order?: number;
  source?: "manual" | "pdf";
  source_filename?: string | null;
}

// POST /api/services — accepts either a single service object or { services: [...] }
// for bulk creation (used by the PDF-import "approve all" flow).
export async function POST(req: NextRequest) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tenantId = (tenant as any).id;

  const list: ServiceInput[] = Array.isArray(body.services)
    ? body.services
    : [body];

  const rows = list
    .filter((s) => typeof s.name === "string" && s.name.trim().length > 0)
    .map((s) => ({
      tenant_id: tenantId,
      name: s.name!.trim(),
      description: s.description?.toString().trim() || null,
      category: s.category?.toString().trim() || null,
      duration_min: typeof s.duration_min === "number" ? s.duration_min : null,
      price_display: s.price_display?.toString().trim() || null,
      price_cents:
        typeof s.price_cents === "number" && Number.isFinite(s.price_cents)
          ? Math.round(s.price_cents)
          : null,
      active: s.active === false ? false : true,
      display_order: typeof s.display_order === "number" ? s.display_order : 0,
      source: s.source === "pdf" ? "pdf" : "manual",
      source_filename: s.source_filename ?? null,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid services to insert" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("tenant_services")
    .insert(rows)
    .select();

  if (error) {
    console.error("[services] insert failed", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
  return NextResponse.json({ services: data, count: data?.length ?? 0 });
}
