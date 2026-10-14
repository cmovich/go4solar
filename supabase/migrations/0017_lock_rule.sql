-- 0017_lock_rule.sql — lock the system when a payment is 7 days overdue (Fix-up 1 #7).
-- Never edit this file after it has been pushed; add a new migration instead. Adds only.
--
-- Phase 1 records the rule and shows it (agreement, customer plan summary, admin "Lock due"
-- badge). The actual remote lock (lock-capable inverters) is Phase 2 and must use this rule:
-- an active plan is due to be locked once its oldest unpaid payment is lock_after_days_overdue
-- days overdue, unless an approved extension is running (src/lib/payments/lock.ts).

-- Admin-editable in Pricing → Late fee (audited like every setting change).
insert into public.settings (key, value)
values ('lock_after_days_overdue', '7')
on conflict (key) do nothing;

-- One approved extension per plan pauses the lock until its last day (inclusive).
-- Written only by staff through the server (service role); customers read their own loan row.
alter table public.loans
  add column extension_until       date,
  add column extension_approved_by uuid references public.profiles (id) on delete set null,
  add column extension_approved_at timestamptz;

-- Consumer agreement v2 (DRAFT, lawyer review still required): the lock clause takes its days
-- from the setting ({{lockAfterDays}}) and says an approved extension pauses the lock.
-- Version 1 is left as it is, because agreements already signed on it must still match it.
insert into public.agreement_templates (type, version, status, body_md)
select 'consumer', 2, 'draft',
       replace(
         body_md,
         'The system is monitored remotely. If a monthly payment is **14 days late**, Go4Solar may lock the system remotely. The system is unlocked promptly once the overdue amount is paid. The Customer may appeal once for **one extension of up to 30 days**, which Go4Solar may grant at its discretion.',
         'The system is monitored remotely. If a monthly payment is **{{lockAfterDays}} days overdue**, Go4Solar may lock the system remotely. The system is unlocked promptly once the overdue amount is paid. The Customer may appeal once for **one extension of up to 30 days**, which Go4Solar may grant at its discretion. While an approved extension is running, the system will not be locked.'
       )
  from public.agreement_templates
 where type = 'consumer' and version = 1
   and not exists (
     select 1 from public.agreement_templates where type = 'consumer' and version = 2
   );
