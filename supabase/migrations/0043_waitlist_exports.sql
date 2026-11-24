-- Waiting-list exports to ANY funder (Semako, 23 Nov 2026). Manage everything from Admin →
-- Waiting list; "Trade Lenda profiles" is retired (its data stays in lead_profiles, its batches
-- and numbers in funder_batches, unchanged).
--
-- * funders: a batch prefix (TL, SP, …; test batches add T: TLT, SPT), the https domains a
--   funder's onboarding links may use, and a contact email (consent-withdrawal notices).
-- * lead_funder_consents: the customer's consent to share their details with ONE funder (who,
--   when, note), and its withdrawal (who, when, note, when the funder was told). The existing
--   Trade Lenda consent ticks are copied in (same who/when/note); the old lead_profiles.consent_tl_*
--   columns stay as they are and are no longer read.
-- * export_queues / export_queue_items: one shared draft queue (EXP-YYYY-NNNN; test EXPT-…)
--   that super admin / Operations fill from both waiting-list tabs, then export as one batch.
-- * funder_batches / funder_batch_items: the queue a batch came from, the level per person
--   (basic / full; existing rows are full), onboarding links (per person or per batch), and
--   consent withdrawn (shown on the funder's dashboard).
-- * onboarding_link_sends: who sent a funder's onboarding link to the customer, how, and when.
-- * lead_profiles.months: 3, 6, 9, 12, 18 or 24 (the SPEWA offer has 3 months).
--
-- Row level security on every new table; writes go through the server only (service role); the
-- 0020 audit trigger records every change (old → new). Nothing is dropped or renamed.

-- 1. Funders -----------------------------------------------------------------------------------
alter table public.funders
  add column batch_prefix text unique check (batch_prefix ~ '^[A-Z]{2,4}$'),
  add column onboarding_domains text[] not null default '{}',
  add column contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

update public.funders set batch_prefix = 'TL' where name ilike 'trade lenda%' and batch_prefix is null;
update public.funders set batch_prefix = 'SP' where name ilike 'spewa%' and batch_prefix is null;

-- 2. Consent per person per funder ------------------------------------------------------------
create table public.lead_funder_consents (
  waitlist_id      uuid not null references public.waitlist_consumers (id) on delete cascade,
  funder_id        uuid not null references public.funders (id),
  consented_at     timestamptz not null,
  consented_by     uuid not null,
  consent_note     text check (char_length(consent_note) <= 500),
  withdrawn_at     timestamptz,
  withdrawn_by     uuid,
  withdrawn_note   text check (char_length(withdrawn_note) <= 500),
  -- When the funder's contact was emailed to stop using and delete the details.
  funder_told_at   timestamptz,
  is_test          boolean not null default false,
  updated_at       timestamptz not null default now(),
  primary key (waitlist_id, funder_id),
  check ((withdrawn_at is null) = (withdrawn_by is null))
);
alter table public.lead_funder_consents enable row level security;
create policy "lead_funder_consents: staff and sales read" on public.lead_funder_consents
  for select to authenticated using (public.is_staff() or public.my_role()::text = 'sales');
revoke insert, update, delete on public.lead_funder_consents from anon, authenticated;
create trigger audit_changes after insert or update or delete on public.lead_funder_consents
  for each row execute function public.audit_row_change('all');

-- The Trade Lenda consent ticks given so far, with the same who / when / note.
insert into public.lead_funder_consents
  (waitlist_id, funder_id, consented_at, consented_by, consent_note, is_test)
select lp.waitlist_id, f.id, lp.consent_tl_at, lp.consent_tl_by, lp.consent_tl_note, lp.is_test
from public.lead_profiles lp
join public.funders f on f.batch_prefix = 'TL'
where lp.consent_tl_at is not null and lp.consent_tl_by is not null
on conflict do nothing;

-- 3. The shared export queue ------------------------------------------------------------------
create sequence if not exists public.export_number_seq;
create sequence if not exists public.export_test_number_seq;

-- EXP-2026-0001 (test: EXPT-2026-0001), so test runs never leave gaps in the real numbers.
create or replace function public.next_export_number(p_test boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  if p_test then
    n := nextval('public.export_test_number_seq');
  else
    n := nextval('public.export_number_seq');
  end if;
  return (case when p_test then 'EXPT-' else 'EXP-' end)
    || to_char(now() at time zone 'Africa/Lagos', 'YYYY') || '-'
    || lpad(n::text, greatest(4, length(n::text)), '0');
end $$;
revoke all on function public.next_export_number(boolean) from public, anon, authenticated;
grant execute on function public.next_export_number(boolean) to service_role;

create table public.export_queues (
  id          uuid primary key default gen_random_uuid(),
  number      text not null unique check (number ~ '^EXPT?-[0-9]{4}-[0-9]{4,}$'),
  status      text not null default 'draft' check (status in ('draft', 'exported', 'discarded')),
  -- Set when exported: the batch this queue became.
  batch_id    uuid,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  closed_by   uuid,
  closed_at   timestamptz,
  is_test     boolean not null default false
);
-- One open (draft) queue at a time, shared by everyone (one for real data, one for test data).
create unique index export_queues_one_open on public.export_queues (is_test) where status = 'draft';

create table public.export_queue_items (
  queue_id    uuid not null references public.export_queues (id) on delete cascade,
  waitlist_id uuid not null references public.waitlist_consumers (id) on delete cascade,
  -- What this person can be sent as when added (incomplete profiles: basic only).
  level       text not null check (level in ('basic', 'full')),
  added_by    uuid not null,
  added_at    timestamptz not null default now(),
  primary key (queue_id, waitlist_id)
);

alter table public.export_queues enable row level security;
alter table public.export_queue_items enable row level security;
create policy "export_queues: staff and sales read" on public.export_queues
  for select to authenticated using (public.is_staff() or public.my_role()::text = 'sales');
create policy "export_queue_items: staff and sales read" on public.export_queue_items
  for select to authenticated using (public.is_staff() or public.my_role()::text = 'sales');
revoke insert, update, delete on public.export_queues from anon, authenticated;
revoke insert, update, delete on public.export_queue_items from anon, authenticated;
create trigger audit_changes after insert or update or delete on public.export_queues
  for each row execute function public.audit_row_change('all');
create trigger audit_changes after insert or update or delete on public.export_queue_items
  for each row execute function public.audit_row_change('all');

-- 4. Batches: level, onboarding links, consent withdrawn ------------------------------------
alter table public.funder_batches
  add column export_queue_id uuid references public.export_queues (id),
  add column onboarding_url text check (onboarding_url is null or onboarding_url ~ '^https://');
alter table public.export_queues
  add constraint export_queues_batch_fk foreign key (batch_id) references public.funder_batches (id);

alter table public.funder_batch_items
  add column level text not null default 'full' check (level in ('basic', 'full')),
  add column onboarding_url text check (onboarding_url is null or onboarding_url ~ '^https://'),
  add column onboarding_set_at timestamptz,
  add column onboarding_set_by uuid,
  -- The customer withdrew consent for this funder after the export (shown on its dashboard).
  add column consent_withdrawn_at timestamptz;

-- Our staff (super admin, Operations, …) now see batches too (exports page); Sales do not.
create policy "funder_batches: staff read" on public.funder_batches
  for select to authenticated using (public.is_staff());
create policy "funder_batch_items: staff read" on public.funder_batch_items
  for select to authenticated using (public.is_staff());

-- 5. Onboarding link sends ----------------------------------------------------------------------
create table public.onboarding_link_sends (
  id             uuid primary key default gen_random_uuid(),
  batch_item_id  uuid not null references public.funder_batch_items (id) on delete cascade,
  channel        text not null check (channel in ('whatsapp', 'email')),
  url            text not null check (url ~ '^https://'),
  sent_by        uuid not null,
  sent_at        timestamptz not null default now(),
  is_test        boolean not null default false
);
alter table public.onboarding_link_sends enable row level security;
create policy "onboarding_link_sends: staff and sales read" on public.onboarding_link_sends
  for select to authenticated using (public.is_staff() or public.my_role()::text = 'sales');
revoke insert, update, delete on public.onboarding_link_sends from anon, authenticated;
create trigger audit_changes after insert or update or delete on public.onboarding_link_sends
  for each row execute function public.audit_row_change('all');

-- 6. Quote length on a profile: every length we offer -------------------------------------------
-- The old rule (6, 9 or 12) was declared without a name: find it by what it checks, replace it.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.lead_profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%months%'
  loop
    execute format('alter table public.lead_profiles drop constraint %I', c);
  end loop;
end $$;
alter table public.lead_profiles
  add constraint lead_profiles_months_check check (months in (3, 6, 9, 12, 18, 24));
