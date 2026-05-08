-- Track where a follow-up task came from. Live calls were the only source
-- when 044 shipped; we now also create them via the Ask-Vivienne chat on
-- the call detail page, a one-time backfill over historical transcripts,
-- and (future) manual entry from the tasks page.
alter table call_followups
  add column if not exists source text not null default 'live'
    check (source in ('live', 'chat', 'backfill', 'manual'));

-- Optional pointer back to the call_logs row. vapi_call_id was the only
-- link before, but backfilled rows are easier to display when we can join
-- directly on the canonical call id. Not enforced as a foreign key so the
-- live-call insert path stays unchanged when the call_logs row hasn't
-- been written yet.
alter table call_followups
  add column if not exists call_log_id uuid;

create index if not exists idx_call_followups_call_log
  on call_followups(call_log_id);
