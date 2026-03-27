/**
 * Authenticated KB routes — scoped to the current user's tenant automatically via RLS
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentTenant } from "@/lib/supabase-server";
import { upsertDocument } from "@/lib/knowledge-base";
import { supabaseAdmin } from "@/lib/supabase";

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

export async function PUT(req: NextRequest) {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, title, content, category } = await req.json();
  if (!id || !title || !content) {
    return NextResponse.json({ error: "id, title, and content required" }, { status: 400 });
  }

  // Verify tenant ownership
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("knowledge_base_documents")
    .select("id, tenant_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (existing.tenant_id !== tenant.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Update the record in DB
  const { error: updateError } = await supabaseAdmin
    .from("knowledge_base_documents")
    .update({
      title,
      content,
      category: category || "general",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  // Regenerate embedding async (best-effort)
  try {
    await upsertDocument(tenant.id, { title, content, category: category || "general" });
  } catch (err) {
    console.error("Failed to regenerate embedding:", err);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const tenant = await getCurrentTenant() as { id: string } | null;
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  // Verify tenant ownership
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("knowledge_base_documents")
    .select("id, tenant_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (existing.tenant_id !== tenant.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: deleteError } = await supabaseAdmin
    .from("knowledge_base_documents")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
