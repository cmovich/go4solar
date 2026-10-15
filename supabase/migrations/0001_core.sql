-- 0001_core.sql — roles, profiles, staff permissions, settings, audit log, outbox.
-- Never edit this file after it has been pushed; add a new migration instead.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'consumer',
  'guarantor',
  'installer',
  'vendor',
  'super_admin',
  'credit_officer',
  'operations',
  'collections',
  'finance',
  'content'
);

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user, created by trigger on sign-up)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone_e164  text,
  email       text,
  role        public.app_role not null default 'consumer',
  state       text,
  created_at  timestamptz not null default now()
);

comment on table public.profiles is 'Every user with their role. Row created automatically on sign-up.';

create index profiles_role_idx on public.profiles (role);
create index profiles_email_idx on public.profiles (lower(email));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone_e164, email)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone_e164', ''),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.has_role(target public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.my_role() = target, false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.my_role() in ('super_admin', 'credit_officer', 'operations', 'collections', 'finance', 'content'),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Staff permissions (extra rights on top of a role, e.g. 'assisted_entry')
-- ---------------------------------------------------------------------------
create table public.staff_permissions (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  permission  text not null check (permission in ('assisted_entry')),
  granted_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  primary key (profile_id, permission)
);

comment on table public.staff_permissions is 'Permissions that can be given to any staff role. Known values: assisted_entry.';

create or replace function public.has_permission(target text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_permissions
    where profile_id = auth.uid() and permission = target
  );
$$;

-- Only a super admin (or the server with the service role key) may change a role.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.role() is distinct from 'service_role'
     and not public.has_role('super_admin') then
    raise exception 'Only a super admin can change a role' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_profile_role
  before update of role on public.profiles
  for each row execute function public.protect_profile_role();

-- ---------------------------------------------------------------------------
-- Settings (key → json), audit log, outbox
-- ---------------------------------------------------------------------------
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now()
);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id),
  action      text not null,
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

create type public.outbox_channel as enum ('sms', 'whatsapp', 'email');

create table public.outbox (
  id          uuid primary key default gen_random_uuid(),
  channel     public.outbox_channel not null,
  "to"        text not null,
  template    text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  created_at  timestamptz not null default now()
);

create index outbox_created_idx on public.outbox (created_at desc);

-- ---------------------------------------------------------------------------
-- Seed settings (percentages as decimals: 0.2 = 20%)
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('min_deposit_share',   '0.2'),
  ('tenures',             '[3, 6, 9, 12]'),
  ('late_fee_daily',      '0.0075'),
  ('late_fee_cap_share',  '0.25'),
  ('quote_validity_days', '7'),
  ('sizing', '{
    "headroom": 1.25,
    "powerFactor": 0.8,
    "dod": 0.8,
    "inverterEfficiency": 0.9,
    "panelDerate": 0.75,
    "panelWatts": 550,
    "nightShare": 0.6,
    "backupHours": { "essential": 3, "comfort": 8 },
    "inverterSizesKva": [1, 1.5, 2.5, 3.5, 5, 7.5, 10, 15, 20],
    "batteryStepKwh": 2.5,
    "pshByState": { "FCT": 5.5, "Kaduna": 5.8, "Lagos": 4.5 }
  }')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.settings          enable row level security;
alter table public.audit_log         enable row level security;
alter table public.outbox            enable row level security;

-- profiles: self can read and update own row; staff can read every row.
create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: staff read all"
  on public.profiles for select
  using (public.is_staff());

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- staff_permissions: staff read; super_admin writes.
create policy "staff_permissions: staff read"
  on public.staff_permissions for select
  using (public.is_staff());

create policy "staff_permissions: super_admin write"
  on public.staff_permissions for all
  using (public.has_role('super_admin'))
  with check (public.has_role('super_admin'));

-- settings: readable by everyone (anon included); writable by super_admin.
create policy "settings: read all"
  on public.settings for select
  using (true);

create policy "settings: super_admin write"
  on public.settings for all
  using (public.has_role('super_admin'))
  with check (public.has_role('super_admin'));

-- audit_log: staff insert their own actions; only super_admin reads.
create policy "audit_log: staff insert"
  on public.audit_log for insert
  with check (public.is_staff() and actor_id = auth.uid());

create policy "audit_log: super_admin read"
  on public.audit_log for select
  using (public.has_role('super_admin'));

-- outbox: staff read. Rows are written by the server (service role) only.
create policy "outbox: staff read"
  on public.outbox for select
  using (public.is_staff());
