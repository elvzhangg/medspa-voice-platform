-- Migration: Add universal KB support with sources tracking
-- Run this in Supabase SQL Editor or via supabase CLI

-- Add columns
ALTER TABLE knowledge_base_documents 
  ADD COLUMN IF NOT EXISTS is_universal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sources TEXT;

-- Index for fast universal doc lookups
CREATE INDEX IF NOT EXISTS idx_kb_universal 
  ON knowledge_base_documents(is_universal) 
  WHERE is_universal = true;

-- Update the search function to include universal docs
CREATE OR REPLACE FUNCTION search_knowledge_base(
  p_tenant_id uuid,
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 5
)
RETURNS SETOF knowledge_base_documents
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM knowledge_base_documents
  WHERE (tenant_id = p_tenant_id OR is_universal = true)
    AND embedding IS NOT NULL
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;
