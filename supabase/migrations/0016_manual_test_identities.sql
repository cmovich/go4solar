-- 0016_manual_test_identities.sql — manual testing with Gmail plus-addresses.
-- Never edit this file after it has been pushed; add a new migration instead. Nothing is deleted.
--
-- Semako tests with addresses like infosemako+g4stest1@gmail.com. Any email whose part before the
-- @ contains "+g4stest" is now test data, like @go4solar.test emails and +234800000 phones.
-- Staff rule: a STAFF account (super_admin, credit_officer, operations, collections, finance,
-- content) is test ONLY with an @go4solar.test email; with any other email (plus-address included)
-- it is never test. Customers, guarantors, installers and vendors follow the test-identity rule.
-- (Fixes 0015, where the "never test" override hit every non-consumer, e.g. an installer with a
-- +234800000 phone.)

-- One rule for every table.
create or replace function public.is_test_identity(p_email text, p_phone text)
returns boolean
language sql
immutable
as $$
  select coalesce(lower(p_email) like '%@go4solar.test', false)
      or coalesce(split_part(lower(p_email), '@', 1) like '%+g4stest%', false)
      or coalesce(p_phone like '+234800000%', false)
$$;

-- ---------------------------------------------------------------------------
-- Accounts (customers). Same guards as before: users cannot change the flag themselves.
-- ---------------------------------------------------------------------------
create or replace function public.mark_test_profile()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  staff_test_email boolean := coalesce(lower(new.email) like '%@go4solar.test', false);
  is_staff_role boolean := new.role in ('super_admin', 'credit_officer', 'operations', 'collections', 'finance', 'content');
  is_user boolean := coalesce(auth.role(), '') in ('authenticated', 'anon');
begin
  if tg_op = 'UPDATE' and is_user then
    if new.is_test is distinct from old.is_test then
      raise exception 'is_test can only be changed by Go4Solar' using errcode = '42501';
    end if;
    return new;
  end if;
  new.is_test := new.is_test or public.is_test_identity(new.email, new.phone_e164);
  -- Staff accounts only: never test unless their email ends in @go4solar.test.
  if is_staff_role and not staff_test_email then
    new.is_test := false;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Waiting-list leads and installer sign-ups
-- ---------------------------------------------------------------------------
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
  new.is_test := new.is_test or public.is_test_identity(new.email, new.phone_e164);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guarantors: test when their own email/phone is a test identity, or the customer is a test account.
-- ---------------------------------------------------------------------------
alter table public.guarantees add column is_test boolean not null default false;

create or replace function public.mark_test_guarantee()
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
    or public.is_test_identity(new.email, new.phone)
    or exists (
      select 1 from public.applications a join public.profiles p on p.id = a.consumer_id
       where a.id = new.application_id and p.is_test
    );
  return new;
end;
$$;
create trigger guarantees_mark_test before insert or update of email, phone, is_test
  on public.guarantees for each row execute function public.mark_test_guarantee();

-- ---------------------------------------------------------------------------
-- Back-fill with the new rule (existing rows that match +g4stest; all guarantors of test customers)
-- ---------------------------------------------------------------------------
-- Every non-staff account (customer, guarantor, installer, vendor) that matches the rule,
-- including installers/vendors 0015 wrongly left as real because of a +234800000 phone.
update public.profiles
   set is_test = true
 where not is_test
   and role in ('consumer', 'guarantor', 'installer', 'vendor')
   and public.is_test_identity(email, phone_e164);

update public.waitlist_consumers
   set is_test = true
 where not is_test and split_part(lower(email), '@', 1) like '%+g4stest%';

update public.waitlist_installers
   set is_test = true
 where not is_test and split_part(lower(email), '@', 1) like '%+g4stest%';

update public.guarantees g
   set is_test = true
 where public.is_test_identity(g.email, g.phone)
    or exists (
      select 1 from public.applications a join public.profiles p on p.id = a.consumer_id
       where a.id = g.application_id and p.is_test
    );

create index guarantees_is_test_idx on public.guarantees (is_test) where is_test;
