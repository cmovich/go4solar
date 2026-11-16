-- SPEWA routing (back office only; nothing changes for customers). Adds only.
--
-- * New app_role value 'funder_approver' ("Funder approver (SPEWA)"). NOT in public.is_staff(),
--   so the account gets no staff read access to any table; the server shows it the SPEWA queue
--   and the files in it after checking the role. public.is_staff_role() gains it so its sign-ins
--   and changes are recorded in the audit log like any staff member's.
-- * settings.funder_routing: business applicants with a deposit of 30% or more go to the SPEWA
--   queue once the deposit is paid (every onboarding step done). Funder = the real
--   "SPEWA programme funds" row.
-- * funder_queue: one row per routed application: the funder, the deposit share at routing, the
--   funder's decision (pending / approved / declined, by whom, when, why) and the post-dated
--   cheques note (received yes/no, number, date received, entered by our staff). A separate
--   table, so customers never read it (applications has an owner-read policy).
--   RLS: super admin and credit officer read; writes are server-only. Every change is audited
--   (0020 trigger).
--
-- The new enum value is compared as text below: Postgres does not allow using a value added in
-- the same transaction as an enum.

alter type public.app_role add value if not exists 'funder_approver';

create or replace function public.is_staff_role(r text) returns boolean
language sql immutable as $$
  select r in ('super_admin', 'credit_officer', 'operations', 'collections', 'finance', 'content', 'sales', 'funder_approver')
$$;

insert into public.settings (key, value) values (
  'funder_routing',
  jsonb_build_object(
    'funderId', (select id from public.funders
                  where name = 'SPEWA programme funds' and not is_test
                  order by created_at limit 1),
    'minDepositShare', 0.3,
    'applicantTypes', jsonb_build_array('business')
  )
) on conflict (key) do nothing;

create table public.funder_queue (
  application_id      uuid primary key references public.applications (id) on delete cascade,
  funder_id           uuid not null references public.funders (id),
  routed_at           timestamptz not null default now(),
  deposit_share       numeric(6, 4) not null check (deposit_share >= 0 and deposit_share <= 1),
  decision            text not null default 'pending'
                        check (decision in ('pending', 'approved', 'declined')),
  -- No foreign keys on people: decisions outlive accounts (like audit_log).
  decided_by          uuid,
  decided_at          timestamptz,
  decision_reason     text check (char_length(decision_reason) <= 1000),
  cheques_received    boolean,
  cheques_count       integer check (cheques_count between 0 and 120),
  cheques_received_on date,
  cheques_updated_by  uuid,
  cheques_updated_at  timestamptz,
  is_test             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (decision = 'pending' or (decided_by is not null and decided_at is not null))
);

create index funder_queue_funder_idx on public.funder_queue (funder_id, decision, routed_at desc);

create trigger funder_queue_updated_at before update on public.funder_queue
  for each row execute function public.set_updated_at();

alter table public.funder_queue enable row level security;
create policy "funder_queue: staff read" on public.funder_queue
  for select to authenticated
  using (public.my_role()::text in ('super_admin', 'credit_officer'));
revoke insert, update, delete on public.funder_queue from anon, authenticated;

create trigger audit_changes after insert or update or delete on public.funder_queue
  for each row execute function public.audit_row_change('all');
