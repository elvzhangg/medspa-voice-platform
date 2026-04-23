-- Migration: Allow 'winback' as an sms_sent_log template_type
--
-- The Follow-up Co-Pilot drafts a personalized SMS for callers who didn't
-- book during their call. These are sent by the tenant (not automatically)
-- after collaborating with the AI on wording, and we log them for audit +
-- idempotency alongside the other template types.
--
-- TCPA-wise, winback to a caller who just called the clinic falls under
-- "established business relationship" — informational SMS is permitted.
-- The fixed STOP language is still appended at send time.

ALTER TABLE sms_sent_log DROP CONSTRAINT IF EXISTS sms_sent_log_template_type_check;
ALTER TABLE sms_sent_log
  ADD CONSTRAINT sms_sent_log_template_type_check
  CHECK (template_type IN ('confirmation', 'reminder', 'followup', 'checkin', 'winback'));
