-- Call follow-up tasks
-- Whenever the AI commits to "having someone reach out" during a call —
-- e.g. defers a medical question, agrees to text a link it can't generate,
-- promises a callback for a specific concern — it logs the action here.
-- Staff see these in the Call Log dashboard and can mark them done.

create table if not exists call_followups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  vapi_call_id text not null,
  customer_phone text,
  customer_name text,
  action text not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id) on delete set null
);

create index if not exists idx_call_followups_tenant_status
  on call_followups(tenant_id, status, created_at desc);
create index if not exists idx_call_followups_vapi_call
  on call_followups(vapi_call_id);

alter table call_followups enable row level security;

create policy "Tenants can read own call followups" on call_followups
  for select using (
    tenant_id in (select tenant_id from tenant_users where user_id = auth.uid())
  );

create policy "Tenants can update own call followups" on call_followups
  for update using (
    tenant_id in (select tenant_id from tenant_users where user_id = auth.uid())
  );

create policy "Service role manages call followups" on call_followups
  for all using (true);
