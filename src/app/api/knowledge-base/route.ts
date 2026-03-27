import { NextRequest, NextResponse } from "next/server";
import { upsertDocument, searchKnowledgeBase } from "@/lib/knowledge-base";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/knowledge-base?tenantId=xxx
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  const query = req.nextUrl.searchParams.get("query");

  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  if (query) {
    // Semantic search
    const results = await searchKnowledgeBase(tenantId, query);
    return NextResponse.json({ results });
  }

  // List all documents for tenant
  const { data, error } = await supabaseAdmin
    .from("knowledge_base_documents")
    .select("id, title, category, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("category");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }

  return NextResponse.json({ documents: data });
}

// POST /api/knowledge-base
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, title, content, category } = body;

    if (!tenantId || !title || !content) {
      return NextResponse.json(
        { error: "tenantId, title, and content are required" },
        { status: 400 }
      );
    }

    await upsertDocument(tenantId, { title, content, category: category || "general" });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Failed to upsert document:", error);
    return NextResponse.json({ error: "Failed to save document" }, { status: 500 });
  }
}
