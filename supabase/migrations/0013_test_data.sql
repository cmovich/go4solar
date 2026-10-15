-- 0013_test_data.sql — label test data so it can be excluded from reports and removed before launch.
-- Never edit this file after it has been pushed; add a new migration instead.
-- Nothing is deleted here.
--
-- Test identity rule (e2e/helpers/test-identity.ts): every fake person uses an email ending in
-- @go4solar.test and/or a phone starting +234800000.
-- Only the server (service role) or a migration can set is_test by hand; signed-in users cannot.
-- A staff account with a real email is never test.

-- ---------------------------------------------------------------------------
-- 1. Accounts
-- ---------------------------------------------------------------------------
alter table public.profiles add column is_test boolean not null default false;

create or replace function public.mark_test_profile()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  test_email boolean := coalesce(lower(new.email) like '%@go4solar.test', false);
begin
  -- Signed-in users (and anonymous visitors) can never change the flag themselves.
  if tg_op = 'UPDATE' and new.is_test is distinct from old.is_test
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'is_test can only be changed by Go4Solar' using errcode = '42501';
  end if;

  -- Test email or test phone → test. Once test, stays test.
  new.is_test := new.is_test or test_email or coalesce(new.phone_e164 like '+234800000%', false);

  -- Staff and admin accounts are never test unless their email is a test email.
  if new.role is distinct from 'consumer' and not test_email then
    new.is_test := false;
  end if;
  return new;
end;
$$;
create trigger profiles_mark_test
  before insert or update of email, phone_e164, role, is_test on public.profiles
  for each row execute function public.mark_test_profile();

-- Back-fill: every existing account is a test account (all 28 use @go4solar.test).
update public.profiles set is_test = true where lower(email) like '%@go4solar.test';

-- ---------------------------------------------------------------------------
-- 2. Waiting-list records (people who are not accounts yet)
-- ---------------------------------------------------------------------------
alter table public.waitlist_consumers  add column is_test boolean not null default false;
alter table public.waitlist_installers add column is_test boolean not null default false;

create or replace function public.mark_test_lead()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.is_test is distinct from old.is_test
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'is_test can only be changed by Go4Solar' using errcode = '42501';
  end if;
  new.is_test := new.is_test
    or coalesce(lower(new.email) like '%@go4solar.test', false)
    or coalesce(new.phone_e164 like '+234800000%', false);
  return new;
end;
$$;
create trigger waitlist_consumers_mark_test before insert or update of email, phone_e164, is_test
  on public.waitlist_consumers for each row execute function public.mark_test_lead();
create trigger waitlist_installers_mark_test before insert or update of email, phone_e164, is_test
  on public.waitlist_installers for each row execute function public.mark_test_lead();

-- Back-fill (rows made by the tests before the identity rule existed):
--  a) leads with an @go4solar.test email (104 rows)
update public.waitlist_consumers set is_test = true where lower(email) like '%@go4solar.test';
--  b) leads that stopped after the phone step with no name and no email, all created by the
--     "leaving after the phone number" and "state dropdown" tests on 10–11 Oct 2026 (27 rows)
update public.waitlist_consumers
   set is_test = true
 where email is null and first_name is null and entered_by is null
   and created_at < timestamptz '2026-10-12 00:00:00+01';
--  c) Semako's own manual test entry (1 row), on his instruction: a clean slate after testing
update public.waitlist_consumers set is_test = true where lower(email) = 'infosemako@gmail.com';
--  d) installer sign-ups from the installer-form test, all named 'Tunde Installs' (31 rows)
update public.waitlist_installers set is_test = true where name = 'Tunde Installs';

create index profiles_is_test_idx on public.profiles (is_test) where is_test;
create index waitlist_consumers_is_test_idx on public.waitlist_consumers (is_test) where is_test;

-- ---------------------------------------------------------------------------
-- 3. Funders: tests draw only from "E2E TEST FUNDER", never from SAMPLE or real funders
-- ---------------------------------------------------------------------------
alter table public.funders add column is_test boolean not null default false;

insert into public.funders
  (name, kind, annual_rate, method, max_tenure, balance_available, status, sample, is_test)
values
  ('E2E TEST FUNDER', 'external', 0.16, 'flat', 12, 900000000000, 'active', false, true);

-- Audit first (actor null = system migration): each test loan that drew on SPEWA, and SPEWA's balance.
insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
select null, 'loans.test_funder_relabel', 'loans', l.id::text,
       jsonb_build_object('funder', 'SPEWA programme funds', 'drawn', l.drawn),
       jsonb_build_object('funder', 'E2E TEST FUNDER', 'drawn', l.drawn,
                          'reason', '0013_test_data: test approvals must not draw on SAMPLE or real funders')
  from public.loans l
  join public.profiles p on p.id = l.consumer_id and p.is_test
 where l.funder_id = (select id from public.funders where name = 'SPEWA programme funds' and sample);

insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
select null, 'funders.test_data_correction', 'funders', f.id::text,
       jsonb_build_object('balance_available', f.balance_available),
       jsonb_build_object('balance_available', 50000000,
                          'reason', '0013_test_data: test draws moved to E2E TEST FUNDER; back to the seed balance')
  from public.funders f
 where f.name = 'SPEWA programme funds' and f.sample;

-- Move the test approvals that drew on SPEWA (test customers only) onto the test funder, keeping
-- every row. The loan's profit snapshot is relabelled to match.
with t as (select id from public.funders where name = 'E2E TEST FUNDER' and is_test),
     s as (select id from public.funders where name = 'SPEWA programme funds' and sample)
update public.funder_draws d
   set funder_id = (select id from t)
  from public.loans l
  join public.profiles p on p.id = l.consumer_id and p.is_test
 where d.loan_id = l.id and d.funder_id = (select id from s);

with t as (select id from public.funders where name = 'E2E TEST FUNDER' and is_test),
     s as (select id from public.funders where name = 'SPEWA programme funds' and sample)
update public.loans l
   set funder_id = (select id from t),
       profit_snapshot = case
         when l.profit_snapshot is null then null
         else jsonb_set(
                jsonb_set(l.profit_snapshot, '{funderId}', to_jsonb((select id from t)::text)),
                '{funderName}', to_jsonb('E2E TEST FUNDER'::text))
       end
  from public.profiles p
 where p.id = l.consumer_id and p.is_test and l.funder_id = (select id from s);

update public.applications a
   set assigned_funder_id = (select id from public.funders where name = 'E2E TEST FUNDER' and is_test)
  from public.profiles p
 where p.id = a.consumer_id and p.is_test
   and a.assigned_funder_id = (select id from public.funders where name = 'SPEWA programme funds' and sample);

-- The test funder carries those draws; SPEWA goes back to its seed balance (₦50,000,000).
update public.funders f
   set balance_available = f.balance_available - coalesce(
         (select sum(d.amount) from public.funder_draws d where d.funder_id = f.id), 0)
 where f.name = 'E2E TEST FUNDER' and f.is_test;
update public.funders set balance_available = 50000000
 where name = 'SPEWA programme funds' and sample;
