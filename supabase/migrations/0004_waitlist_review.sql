-- 0004_waitlist_review.sql — waitlist review changes: applicant type + business details,
-- sizing settings for the revised engine.
-- Never edit this file after it has been pushed; add a new migration instead.

-- ---------------------------------------------------------------------------
-- Individual vs business pathway
-- ---------------------------------------------------------------------------
alter table public.waitlist_consumers
  add column applicant_type text check (applicant_type in ('individual', 'business')),
  add column business jsonb;

comment on column public.waitlist_consumers.applicant_type is 'Who the solar is for: individual (home) or business.';
comment on column public.waitlist_consumers.business is 'Business pathway answers: name, type, CAC number, contact role, staff, hours/days, monthly fuel and electricity spend.';

create index waitlist_consumers_applicant_type_idx on public.waitlist_consumers (applicant_type);

-- ---------------------------------------------------------------------------
-- Sizing settings: battery hours for every plan (incl. independence) and the charge window.
-- `nightShare` and `pshByState` stay in the row but the sizing engine no longer reads them.
-- ---------------------------------------------------------------------------
update public.settings
set value = value
  || jsonb_build_object('chargeHours', 7)
  || jsonb_build_object('backupHours', coalesce(value -> 'backupHours', '{}'::jsonb) || '{"independence": 15}'::jsonb),
    updated_at = now()
where key = 'sizing';
