-- 0018_outbox_not_sent.sql — production messages without a provider are kept as "not_sent".
-- Never edit this file after it has been pushed; add a new migration instead. Nothing is deleted.
--
-- Prelaunch production has no SMS/email keys yet. Messages are written to the outbox with
-- status 'not_sent' (staff follow up from /admin/outbox) instead of the mock's 'queued'.
-- Only the allowed values of outbox.status widen; every existing row stays valid.

alter table public.outbox drop constraint if exists outbox_status_check;
alter table public.outbox
  add constraint outbox_status_check check (status in ('queued', 'sent', 'failed', 'not_sent'));
