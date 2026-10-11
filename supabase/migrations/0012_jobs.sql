-- 0012_jobs.sql — approval decisions, funder draws, installation jobs, assisted entry fields.
-- Never edit this file after it has been pushed; add a new migration instead.

-- A loan is 'approved' between the credit decision and commissioning (then 'active').
alter type public.loan_status add value if not exists 'approved' after 'pending_approval';

-- ---------------------------------------------------------------------------
-- Decisions on applications, and assisted entry
-- ---------------------------------------------------------------------------
alter table public.applications
  add column decided_by         uuid references public.profiles (id) on delete set null,
  add column decided_at         timestamptz,
  add column decision_reason    text,
  -- what the credit officer asked the customer to fix (status 'more_info')
  add column more_info_request  text,
  -- assisted entry: how the customer reached staff ('phone_call' | 'walk_in' | 'whatsapp' | 'field_visit')
  add column entry_channel      text;

alter table public.loans
  add column approved_by  uuid references public.profiles (id) on delete set null,
  add column approved_at  timestamptz,
  -- money drawn from the funder at approval: max(0, cost price − deposit)
  add column drawn        numeric(14,2);

-- One draw per loan, against the funder chosen at approval.
create table public.funder_draws (
  id          uuid primary key default gen_random_uuid(),
  funder_id   uuid not null references public.funders (id) on delete restrict,
  loan_id     uuid not null unique references public.loans (id) on delete restrict,
  amount      numeric(14,2) not null check (amount >= 0),
  -- the funder's balance_available right after this draw
  balance_after numeric(14,2) not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Take `p_amount` from an active funder's balance in one step; null if it does not have enough.
create or replace function public.draw_from_funder(p_funder uuid, p_amount numeric)
returns numeric
language sql
security definer
set search_path = public
as $$
  update public.funders
     set balance_available = balance_available - p_amount
   where id = p_funder and status = 'active' and balance_available >= p_amount
  returning balance_available
$$;
revoke all on function public.draw_from_funder(uuid, numeric) from public, anon, authenticated;
grant execute on function public.draw_from_funder(uuid, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- Installation jobs (Phase 1: assigned by hand)
-- ---------------------------------------------------------------------------
create type public.job_status as enum ('assigned', 'picked_up', 'installed', 'commissioned');
create type public.equipment_source as enum ('go4solar_store', 'vendor');

create table public.jobs (
  id                   uuid primary key default gen_random_uuid(),
  loan_id              uuid not null unique references public.loans (id) on delete restrict,
  installer_name       text not null,
  installer_phone      text not null,
  equipment_source     public.equipment_source not null,
  vendor_name          text,
  pickup_code          text not null check (pickup_code ~ '^[0-9]{6}$'),
  scheduled_date       date,
  status               public.job_status not null default 'assigned',
  -- {"panels": ["SN…"], "batteries": ["SN…"], "inverters": ["SN…"]}
  serials              jsonb not null default '{}'::jsonb,
  -- storage paths in the private 'jobs' bucket
  photos               text[] not null default '{}',
  notes                text,
  assigned_by          uuid references public.profiles (id) on delete set null,
  picked_up_at         timestamptz,
  installed_at         timestamptz,
  customer_signoff_at  timestamptz,
  commissioned_at      timestamptz,
  -- separation of duties: never the person who approved the loan
  payout_confirmed_by  uuid references public.profiles (id) on delete set null,
  payout_confirmed_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (equipment_source = 'go4solar_store' or vendor_name is not null)
);
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: staff read; the customer reads the job for their own loan; writes on the server only.
-- ---------------------------------------------------------------------------
alter table public.funder_draws enable row level security;
alter table public.jobs         enable row level security;

create policy "funder_draws: staff read" on public.funder_draws for select using (public.is_staff());
create policy "jobs: staff read" on public.jobs for select using (public.is_staff());
create policy "jobs: own read" on public.jobs for select using (
  exists (select 1 from public.loans l where l.id = jobs.loan_id and l.consumer_id = auth.uid())
);

-- Commissioning photos: private bucket, staff read through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('jobs', 'jobs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "jobs bucket: staff read" on storage.objects for select
  using (bucket_id = 'jobs' and public.is_staff());

-- Credit officers approve up to this amount financed (naira); above it only a super admin.
insert into public.settings (key, value) values ('approval_limit_credit_officer', '3000000')
on conflict (key) do nothing;
