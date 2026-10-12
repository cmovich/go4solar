-- 0015_hardening.sql — Phase 1 hardening: tighter row rules, consent records, soft "clear".
-- Never edit this file after it has been pushed; add a new migration instead. Nothing is deleted.

-- ---------------------------------------------------------------------------
-- 1. Profiles: a signed-in user may only change their own name and state.
--    (Before: any column of their own row — e.g. email_verified_at — except role.)
-- ---------------------------------------------------------------------------
revoke update on public.profiles from anon, authenticated;
grant update (full_name, state) on public.profiles to authenticated;

-- The test flag never changes from a user's own update (a +234800000 phone or test email set by
-- the user must not hide them from reports). Only the server / migrations set it.
create or replace function public.mark_test_profile()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  test_email boolean := coalesce(lower(new.email) like '%@go4solar.test', false);
  is_user boolean := coalesce(auth.role(), '') in ('authenticated', 'anon');
begin
  if tg_op = 'UPDATE' and is_user then
    if new.is_test is distinct from old.is_test then
      raise exception 'is_test can only be changed by Go4Solar' using errcode = '42501';
    end if;
    return new;
  end if;
  new.is_test := new.is_test or test_email or coalesce(new.phone_e164 like '+234800000%', false);
  if new.role is distinct from 'consumer' and not test_email then
    new.is_test := false;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Audit log: staff can only write rows in their own name (no forging another actor).
-- ---------------------------------------------------------------------------
drop policy "audit_log: staff insert" on public.audit_log;
create policy "audit_log: staff insert own" on public.audit_log for insert
  with check (public.is_staff() and actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Settings: business settings (approval limit, refund days …) are staff-only. The public
--    site reads prices and sizing on the server (service role), never from the browser.
-- ---------------------------------------------------------------------------
drop policy "settings: read all" on public.settings;
create policy "settings: staff read" on public.settings for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- 4. Server-only tables (codes, verification links, rate limits): RLS is on with no policy,
--    and now no table privileges for browser roles either.
-- ---------------------------------------------------------------------------
revoke all on public.email_verifications, public.phone_otps, public.rate_limits, public.signature_otps
  from anon, authenticated;
comment on table public.email_verifications is 'Server only (service role). No browser access.';
comment on table public.phone_otps is 'Server only (service role). Code hashes only. No browser access.';
comment on table public.rate_limits is 'Server only (service role) via hit_rate_limit(). No browser access.';
comment on table public.signature_otps is 'Server only (service role). Code hashes only. No browser access.';

-- ---------------------------------------------------------------------------
-- 5. "Clear waiting list" marks rows; the retention job deletes them later (7-day grace).
-- ---------------------------------------------------------------------------
alter table public.waitlist_consumers  add column cleared_at timestamptz;
alter table public.waitlist_installers add column cleared_at timestamptz;
create index waitlist_consumers_cleared_idx on public.waitlist_consumers (cleared_at) where cleared_at is not null;

-- ---------------------------------------------------------------------------
-- 6. Consent records: every tick, with the time and the exact text version agreed to.
-- ---------------------------------------------------------------------------
create type public.consent_kind as enum
  ('contact', 'biometric', 'credit_check', 'agreement', 'collateral', 'remote_lock', 'guarantee', 'marketing');
create type public.consent_subject as enum ('profile', 'guarantee', 'waitlist_lead', 'installer_lead');

create table public.consents (
  id            uuid primary key default gen_random_uuid(),
  subject_type  public.consent_subject not null,
  subject_id    uuid not null,
  -- the signed-in person, when there is one (null for anonymous waitlist / guarantor link)
  profile_id    uuid references public.profiles (id) on delete set null,
  kind          public.consent_kind not null,
  -- e.g. 'biometric-2026-10-10'; text_sha256 proves the exact wording shown
  text_version  text not null,
  text_sha256   text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  given_at      timestamptz not null default now(),
  ip            text,
  created_at    timestamptz not null default now()
);
create index consents_subject_idx on public.consents (subject_type, subject_id);

alter table public.consents enable row level security;
create policy "consents: own read" on public.consents for select using (profile_id = auth.uid());
create policy "consents: staff read" on public.consents for select using (public.is_staff());
