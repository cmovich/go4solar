-- 0008_applications.sql — email verification, applications, KYC checks, documents, private storage.
-- Never edit this file after it has been pushed; add a new migration instead.

-- ---------------------------------------------------------------------------
-- Email verification (sign-up is not blocked; verification is required before signing terms)
-- ---------------------------------------------------------------------------
alter table public.profiles add column email_verified_at timestamptz;

create table public.email_verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       text not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.email_verifications enable row level security; -- service role only

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------
create type public.application_status as enum
  ('draft', 'submitted', 'under_review', 'approved', 'declined', 'more_info');

create table public.applications (
  id                    uuid primary key default gen_random_uuid(),
  consumer_id           uuid not null references public.profiles (id) on delete cascade,
  quote_id              uuid references public.quotes (id) on delete set null,
  applicant_type        text not null default 'individual' check (applicant_type in ('individual', 'business')),
  status                public.application_status not null default 'draft',
  -- Which wizard steps are complete, e.g. {"details": true, "nin": true}
  steps                 jsonb not null default '{}'::jsonb,
  -- Names, DOB, contact, state/LGA, and ONLY the last 4 digits of NIN/BVN
  personal              jsonb not null default '{}'::jsonb,
  employment            jsonb,
  next_of_kin           jsonb,
  business              jsonb,
  install_address       jsonb,
  map_pin               point,
  income_range          text,
  guarantor             jsonb,
  affordability         jsonb,
  credit_flags          jsonb not null default '{}'::jsonb,
  biometric_consent_at  timestamptz,
  assigned_funder_id    uuid references public.funders (id) on delete set null,
  entered_by            uuid references public.profiles (id) on delete set null,
  submitted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();
create index applications_consumer_idx on public.applications (consumer_id);
create index applications_status_idx on public.applications (status, created_at desc);

-- ---------------------------------------------------------------------------
-- KYC checks (one row per attempt). Never the raw NIN/BVN: last 4 + provider reference only.
-- ---------------------------------------------------------------------------
create type public.kyc_subject as enum ('consumer', 'guarantor', 'installer', 'vendor', 'business');
create type public.kyc_kind as enum ('nin', 'bvn', 'liveness', 'face_match', 'address', 'cac');
create type public.kyc_status as enum ('pending', 'passed', 'failed', 'manual_review');

create table public.kyc_checks (
  id              uuid primary key default gen_random_uuid(),
  subject_type    public.kyc_subject not null,
  -- For consumer/business checks this is the application id
  subject_id      uuid not null,
  kind            public.kyc_kind not null,
  provider        text not null,
  provider_ref    text,
  status          public.kyc_status not null default 'pending',
  attempt         integer not null default 1,
  result_summary  jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index kyc_checks_subject_idx on public.kyc_checks (subject_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Documents (files live in the private 'kyc' bucket under <owner_id>/<application_id>/…)
-- ---------------------------------------------------------------------------
create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  application_id  uuid references public.applications (id) on delete cascade,
  kind            text not null,
  storage_path    text not null unique,
  created_at      timestamptz not null default now()
);
create index documents_application_idx on public.documents (application_id);

-- ---------------------------------------------------------------------------
-- RLS: a consumer reads only their own rows; staff read all. Writes go through server actions.
-- ---------------------------------------------------------------------------
alter table public.applications enable row level security;
alter table public.kyc_checks   enable row level security;
alter table public.documents    enable row level security;

create policy "applications: owner read" on public.applications for select using (consumer_id = auth.uid());
create policy "applications: staff read" on public.applications for select using (public.is_staff());

create policy "kyc_checks: owner read" on public.kyc_checks for select using (
  exists (select 1 from public.applications a where a.id = kyc_checks.subject_id and a.consumer_id = auth.uid())
);
create policy "kyc_checks: staff read" on public.kyc_checks for select using (public.is_staff());

create policy "documents: owner read" on public.documents for select using (owner_id = auth.uid());
create policy "documents: staff read" on public.documents for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Private storage bucket for ID images, selfies, statements, certificates
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc', 'kyc', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "kyc objects: owner read" on storage.objects for select
  using (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kyc objects: owner insert" on storage.objects for insert
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kyc objects: staff read" on storage.objects for select
  using (bucket_id = 'kyc' and public.is_staff());
