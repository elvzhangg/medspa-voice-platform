-- ─── Auth: Link tenants to Supabase Auth users ───────────────────────────────

-- Tenant owners: maps auth users to tenants (many users can manage one tenant)
create table if not exists tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff', 'admin')),
  created_at timestamptz not null default now(),
  unique(tenant_id, user_id)
);

create index if not exists idx_tenant_users_user_id on tenant_users(user_id);
create index if not exists idx_tenant_users_tenant_id on tenant_users(tenant_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table tenants enable row level security;
alter table knowledge_base_documents enable row level security;
alter table call_logs enable row level security;
alter table tenant_users enable row level security;

-- Helper function: get tenant IDs for the current user
create or replace function my_tenant_ids()
returns setof uuid
language sql stable security definer
as $$
  select tenant_id from tenant_users where user_id = auth.uid();
$$;

-- Helper function: is current user a platform admin?
create or replace function is_platform_admin()
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from tenant_users
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- Tenants: owners see only their own tenant; admins see all
create policy "Tenants: owners see own" on tenants
  for select using (id in (select my_tenant_ids()) or is_platform_admin());

create policy "Tenants: owners update own" on tenants
  for update using (id in (select my_tenant_ids()) or is_platform_admin());

create policy "Tenants: admins insert" on tenants
  for insert with check (is_platform_admin());

-- KB Documents: scoped to tenant
create policy "KB: owners manage own" on knowledge_base_documents
  for all using (tenant_id in (select my_tenant_ids()) or is_platform_admin());

-- Call Logs: read-only for owners
create policy "Calls: owners read own" on call_logs
  for select using (tenant_id in (select my_tenant_ids()) or is_platform_admin());

create policy "Calls: service role insert" on call_logs
  for insert with check (true); -- webhook uses service role

-- Tenant Users: users see their own memberships
create policy "TenantUsers: see own" on tenant_users
  for select using (user_id = auth.uid() or is_platform_admin());

create policy "TenantUsers: admins manage" on tenant_users
  for all using (is_platform_admin());
