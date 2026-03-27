/**
 * Authenticated KB routes — scoped to the current user's tenant automatically via RLS
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentTenant } from "@/lib/supabase-server";
import { upsertDocument } from "@/lib/knowledge-base";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("knowledge_base_documents")
    .select("id, title, content, category, created_at, updated_at")
    .eq("tenant_id", tenant.id)
    .order("category");

  if (error) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  return NextResponse.json({ documents: data });
}

export async function POST(req: NextRequest) {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, content, category } = await req.json();
  if (!title || !content) {
    return NextResponse.json({ error: "title and content required" }, { status: 400 });
  }

  await upsertDocument(tenant.id, { title, content, category: category || "general" });
  return NextResponse.json({ success: true }, { status: 201 });
}
