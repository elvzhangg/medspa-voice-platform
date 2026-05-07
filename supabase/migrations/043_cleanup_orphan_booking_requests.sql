-- One-time cleanup for orphan booking_requests created by the AI before
-- the calendar_events silent-insert bug was fixed (see booking.ts:376).
--
-- Symptom: booking_requests row exists, but no matching calendar_events row,
-- because the original code in bookInternal() called .insert() without
-- checking the returned error. Anything that prevented the insert (RLS drift,
-- type mismatch, etc.) silently dropped the row, while the AI happily told
-- the caller "you're booked."
--
-- The same bug also surfaced wildly wrong dates from the AI, e.g. resolving
-- "tomorrow" against its training-data anchor instead of today's actual date.
-- Both root causes are fixed in code; this migration cleans up the residue
-- in production data.
--
-- Strategy:
--   1. Find orphan booking_requests (no matching calendar_events).
--   2. If preferred_date is BEFORE the request was created, the AI got the
--      date wrong — these are unrecoverable as appointments. Mark cancelled.
--   3. If preferred_date is on/after the request created_at AND in the future,
--      the date may still be valid — backfill the calendar_events row.
--   4. Past-but-after-creation orphans (e.g. user actually wanted a date
--      that has since passed) get marked cancelled — staff can recreate
--      manually if needed.
--
-- All actions are scoped strictly to orphans, so re-running is a no-op.

with orphans as (
  select br.id, br.tenant_id, br.customer_name, br.customer_phone,
         br.service, br.preferred_date, br.preferred_time, br.created_at
  from booking_requests br
  left join calendar_events ce
    on ce.tenant_id = br.tenant_id
   and ce.customer_phone = br.customer_phone
   and ce.start_time::date = br.preferred_date::date
  where br.preferred_date is not null
    and br.preferred_time is not null
    and br.status = 'pending'
    and ce.id is null
),
-- Backfill the calendar event for orphans whose date is still usable
-- (on or after creation, on or after today). The composite key
-- (tenant_id, start_time, customer_phone) effectively dedupes via the
-- left-join filter above, so we won't double-write.
backfill as (
  insert into calendar_events
    (tenant_id, title, start_time, end_time,
     customer_name, customer_phone, service_type, status, booked_via_ai)
  select tenant_id,
         customer_name || ' - ' || service,
         (preferred_date::text || 'T' || preferred_time::text)::timestamptz,
         (preferred_date::text || 'T' || preferred_time::text)::timestamptz + interval '1 hour',
         customer_name, customer_phone, service, 'confirmed', true
  from orphans
  where preferred_date >= created_at::date
    and preferred_date >= current_date
  returning customer_phone, start_time
)
-- Cancel orphan booking_requests that we couldn't safely backfill.
-- This catches both wrong-date orphans (AI got the year wrong, etc.)
-- and orphans whose date has since passed.
update booking_requests br
set status = 'cancelled',
    notes = coalesce(notes, '') ||
            case when coalesce(notes, '') = '' then '' else E'\n' end ||
            '[auto-cancelled by migration 043: orphan booking_request, no calendar event landed]'
from orphans o
where br.id = o.id
  and not (
    o.preferred_date >= o.created_at::date
    and o.preferred_date >= current_date
  );
