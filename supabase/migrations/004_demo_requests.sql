-- Demo request submissions from homepage
create table if not exists demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  business_name text not null,
  phone text,
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_demo_requests_status on demo_requests(status);
create index if not exists idx_demo_requests_created_at on demo_requests(created_at desc);
