import OpenAI from "openai";
import { supabaseAdmin } from "./supabase";
import { KnowledgeBaseDocument } from "@/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Generate an embedding for a text string
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Search the knowledge base for a tenant using vector similarity
 */
export async function searchKnowledgeBase(
  tenantId: string,
  query: string,
  limit = 5
): Promise<KnowledgeBaseDocument[]> {
  const embedding = await generateEmbedding(query);

  const { data, error } = await supabaseAdmin.rpc("search_knowledge_base", {
    p_tenant_id: tenantId,
    p_query_embedding: embedding,
    p_match_count: limit,
  });

  if (error) {
    console.error("Knowledge base search error:", error);
    return [];
  }

  return data || [];
}

/**
 * Add or update a knowledge base document for a tenant
 */
export async function upsertDocument(
  tenantId: string,
  doc: Omit<KnowledgeBaseDocument, "id" | "tenant_id" | "embedding" | "created_at" | "updated_at">
): Promise<void> {
  const embedding = await generateEmbedding(`${doc.title}\n\n${doc.content}`);

  const { error } = await supabaseAdmin.from("knowledge_base_documents").upsert({
    tenant_id: tenantId,
    title: doc.title,
    content: doc.content,
    category: doc.category,
    embedding,
  });

  if (error) throw error;
}

/**
 * Format KB results into a context string for the LLM
 */
export function formatKBContext(docs: KnowledgeBaseDocument[]): string {
  if (docs.length === 0) return "";

  return docs
    .map((doc) => `## ${doc.title}\n${doc.content}`)
    .join("\n\n---\n\n");
}
