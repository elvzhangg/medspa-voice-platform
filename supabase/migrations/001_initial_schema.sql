-- Enable pgvector for semantic search
create extension if not exists vector;

-- ─── Tenants ────────────────────────────────────────────────────────────────
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  phone_number text not null unique,        -- Vapi phone number, e.g. "+14155551234"
  vapi_assistant_id text,                   -- Optional: pre-created permanent assistant
  voice_id text not null default 'rachel',  -- ElevenLabs voice ID
  greeting_message text not null default 'Thank you for calling! How can I help you today?',
  system_prompt_override text,              -- Optional per-tenant prompt additions
  business_hours jsonb,                     -- { monday: { open: "09:00", close: "18:00" }, ... }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Knowledge Base Documents ────────────────────────────────────────────────
create table if not exists knowledge_base_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  content text not null,
  category text not null check (category in ('services', 'pricing', 'policies', 'faq', 'general')),
  embedding vector(1536),                   -- text-embedding-3-small dimensions
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast tenant filtering
create index if not exists idx_kb_tenant_id on knowledge_base_documents(tenant_id);

-- IVFFlat index for vector similarity search
create index if not exists idx_kb_embedding on knowledge_base_documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ─── Call Logs ───────────────────────────────────────────────────────────────
create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  vapi_call_id text not null unique,
  caller_number text,
  duration_seconds integer,
  summary text,
  transcript text,
  created_at timestamptz not null default now()
);

create index if not exists idx_call_logs_tenant_id on call_logs(tenant_id);

-- ─── Vector Search Function ──────────────────────────────────────────────────
create or replace function search_knowledge_base(
  p_tenant_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 5
)
returns setof knowledge_base_documents
language sql stable
as $$
  select *
  from knowledge_base_documents
  where tenant_id = p_tenant_id
    and embedding is not null
  order by embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- ─── Updated At Trigger ──────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_updated_at
  before update on tenants
  for each row execute function update_updated_at();

create trigger kb_documents_updated_at
  before update on knowledge_base_documents
  for each row execute function update_updated_at();
