-- Trade Lenda: complete waiting-list profiles and send them to Trade Lenda in batches.
-- Adds only (nothing dropped or renamed). Applied only with Semako's yes.
--
-- * app_role value 'funder_partner' ("Funder (Trade Lenda)"): like 'funder_approver', NOT in
--   public.is_staff() (no staff read access to any table); added to public.is_staff_role() so
--   sign-ins and changes are audited. funder_users ties each such account to one funder.
-- * lead_profiles: one row per waiting-list entry, completed by staff on the phone: personal
--   details, address (street, landmark), work and income, NIN/BVN LAST 4 DIGITS ONLY (the full
--   numbers are never stored), guarantor, the chosen plan/system, deposit and months, and three
--   required ticks with who/when/note: verified by phone, consent to share with Trade Lenda,
--   agreed to the Trade Lenda figures. Read by staff and Sales; written only by the server
--   (super admin / Operations / Sales, checked there); every change audited old → new (0020).
-- * funder_batches + funder_batch_items: numbered batches (TL-Batch-001…) with versions. Each
--   item holds a FROZEN snapshot made by one server function that copies only what the funder may
--   see (never cost, vendor prices, margins, profit or per-item prices), and the funder's
--   decision (approved / declined / needs info) with note, who and when.
--   Read: super admin all; a funder_partner only its own funder's batches. Writes: server only.
-- * Lending type (Semako, 18 Nov: Trade Lenda does BOTH):
--   funders.lending_types (what the funder may do: 'customer' = lends to the customer and pays
--   Go4Solar the price upfront; 'go4solar' = lends to Go4Solar) and funders.default_lending_type.
--   Every existing funder keeps today's meaning ('go4solar' only). Trade Lenda: both, default
--   'customer', rate 4% a month flat = 0.48 a year; it STAYS SAMPLE until Semako confirms it.
--   funder_batches.lending_type: one type per batch, kept by every version.
--   loans.lending_type: set at approval for files financed under a lending type (null = the old
--   way, every loan before this). 'customer': no funder interest, profit = price − cost.
--   'go4solar': drawn = the customer's amount financed (price − deposit), never a cost figure.

alter type public.app_role add value if not exists 'funder_partner';

alter table public.funders
  add column lending_types text[] not null default array['go4solar']
    check (cardinality(lending_types) > 0 and lending_types <@ array['customer', 'go4solar']),
  add column default_lending_type text not null default 'go4solar'
    check (default_lending_type in ('customer', 'go4solar'));
alter table public.funders
  add constraint funders_default_lending_type_allowed
    check (default_lending_type = any (lending_types));

-- Trade Lenda: lends to customers and to Go4Solar; 4% a month flat (0.48 a year). Still SAMPLE.
update public.funders
   set lending_types = array['customer', 'go4solar'],
       default_lending_type = 'customer',
       annual_rate = 0.48,
       method = 'flat'
 where name = 'Trade Lenda' and not is_test;

alter table public.loans
  add column lending_type text check (lending_type in ('customer', 'go4solar'));

create or replace function public.is_staff_role(r text) returns boolean
language sql immutable as $$
  select r in ('super_admin', 'credit_officer', 'operations', 'collections', 'finance', 'content',
               'sales', 'funder_approver', 'funder_partner')
$$;

-- Which funder each funder_partner account belongs to (one funder per account).
create table public.funder_users (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  funder_id  uuid not null references public.funders (id),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.funder_users enable row level security;
create policy "funder_users: super_admin read" on public.funder_users
  for select to authenticated using (public.my_role()::text = 'super_admin');
create policy "funder_users: own row" on public.funder_users
  for select to authenticated using (profile_id = auth.uid());
revoke insert, update, delete on public.funder_users from anon, authenticated;
create trigger audit_changes after insert or update or delete on public.funder_users
  for each row execute function public.audit_row_change('all');

-- The funder this signed-in account belongs to (null for everyone else).
create or replace function public.my_funder_id() returns uuid
language sql stable security definer set search_path = public as $$
  select funder_id from public.funder_users where profile_id = auth.uid()
$$;

create table public.lead_profiles (
  waitlist_id          uuid primary key references public.waitlist_consumers (id) on delete cascade,
  -- Personal
  other_names          text check (char_length(other_names) <= 80),
  date_of_birth        date check (date_of_birth > '1900-01-01'),
  -- Address (state and LGA stay on the waiting-list entry)
  street               text check (char_length(street) <= 200),
  landmark             text check (char_length(landmark) <= 200),
  -- Work and income
  employment_type      text check (employment_type in
                         ('employed', 'self_employed', 'business_owner', 'retired', 'student', 'other')),
  employer             text check (char_length(employer) <= 120),
  job_title            text check (char_length(job_title) <= 80),
  income_range         text check (char_length(income_range) <= 40),
  -- ID: last 4 digits ONLY (the full NIN/BVN is never stored)
  nin_last4            text check (nin_last4 ~ '^[0-9]{4}$'),
  bvn_last4            text check (bvn_last4 ~ '^[0-9]{4}$'),
  -- Guarantor
  guarantor_name       text check (char_length(guarantor_name) <= 120),
  guarantor_phone_e164 text check (guarantor_phone_e164 ~ '^\+[0-9]{8,15}$'),
  guarantor_relationship text check (char_length(guarantor_relationship) <= 60),
  guarantor_address    text check (char_length(guarantor_address) <= 200),
  -- Plan: which plan of the entry (ready-made plan, builder system or a calculator plan)
  plan_kind            text check (plan_kind in ('ready', 'builder', 'estimate')),
  plan_ref             text check (char_length(plan_ref) <= 80),
  deposit_share        numeric(6, 4) check (deposit_share >= 0.2 and deposit_share <= 0.95),
  months               integer check (months in (6, 9, 12)),
  -- Required ticks (who / when / note). No foreign keys on people: records outlive accounts.
  phone_verified_at    timestamptz,
  phone_verified_by    uuid,
  phone_verified_note  text check (char_length(phone_verified_note) <= 500),
  consent_tl_at        timestamptz,
  consent_tl_by        uuid,
  consent_tl_note      text check (char_length(consent_tl_note) <= 500),
  figures_agreed_at    timestamptz,
  figures_agreed_by    uuid,
  figures_agreed_note  text check (char_length(figures_agreed_note) <= 500),
  -- The Trade Lenda figures the customer agreed to (so a later price change is noticed)
  figures_agreed       jsonb,
  is_test              boolean not null default false,
  updated_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger lead_profiles_updated_at before update on public.lead_profiles
  for each row execute function public.set_updated_at();
alter table public.lead_profiles enable row level security;
create policy "lead_profiles: staff and sales read" on public.lead_profiles
  for select to authenticated using (public.is_staff() or public.my_role()::text = 'sales');
revoke insert, update, delete on public.lead_profiles from anon, authenticated;
create trigger audit_changes after insert or update or delete on public.lead_profiles
  for each row execute function public.audit_row_change('all');

create table public.funder_batches (
  id           uuid primary key default gen_random_uuid(),
  funder_id    uuid not null references public.funders (id),
  -- TL-Batch-001 (the same number for every version of one batch)
  number       text not null check (number ~ '^[A-Z]{2,5}-Batch-[0-9]{3,}$'),
  version      integer not null default 1 check (version >= 1),
  -- Who Trade Lenda lends to for this batch (every version keeps it).
  lending_type text not null check (lending_type in ('customer', 'go4solar')),
  -- Set on a version when a newer version replaces it.
  replaced_by  uuid references public.funder_batches (id),
  -- Aggregate figures for the batch summary (funder-safe, frozen at sending).
  totals       jsonb not null,
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  is_test      boolean not null default false,
  unique (funder_id, number, version)
);
create table public.funder_batch_items (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.funder_batches (id) on delete cascade,
  waitlist_id   uuid not null references public.waitlist_consumers (id),
  -- Frozen, funder-safe snapshot (profile, plan items and quantities, figures, ticks).
  snapshot      jsonb not null,
  decision      text not null default 'pending'
                  check (decision in ('pending', 'approved', 'declined', 'needs_info')),
  decision_note text check (char_length(decision_note) <= 1000),
  decided_by    uuid,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (batch_id, waitlist_id)
);
create index funder_batch_items_waitlist_idx on public.funder_batch_items (waitlist_id);
create trigger funder_batch_items_updated_at before update on public.funder_batch_items
  for each row execute function public.set_updated_at();

alter table public.funder_batches enable row level security;
alter table public.funder_batch_items enable row level security;
create policy "funder_batches: super_admin or own funder" on public.funder_batches
  for select to authenticated
  using (public.my_role()::text = 'super_admin' or funder_id = public.my_funder_id());
create policy "funder_batch_items: super_admin or own funder" on public.funder_batch_items
  for select to authenticated
  using (
    public.my_role()::text = 'super_admin'
    or exists (select 1 from public.funder_batches b
               where b.id = batch_id and b.funder_id = public.my_funder_id())
  );
revoke insert, update, delete on public.funder_batches from anon, authenticated;
revoke insert, update, delete on public.funder_batch_items from anon, authenticated;
create trigger audit_changes after insert or update or delete on public.funder_batches
  for each row execute function public.audit_row_change('all');
create trigger audit_changes after insert or update or delete on public.funder_batch_items
  for each row execute function public.audit_row_change('all');
