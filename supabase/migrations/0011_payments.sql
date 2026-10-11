-- 0011_payments.sql — loans, repayment schedule, direct-debit mandates, payments.
-- Never edit this file after it has been pushed; add a new migration instead.
-- Writes happen only on the server (service role); customers read their own rows, staff read all.

create type public.loan_status as enum ('pending_approval', 'active', 'completed', 'defaulted', 'cancelled');
create type public.schedule_status as enum ('due', 'paid', 'late');
create type public.mandate_status as enum ('pending', 'active', 'failed', 'cancelled');
create type public.payment_kind as enum ('deposit', 'instalment', 'refund');
create type public.payment_status as enum ('pending', 'success', 'failed');

-- ---------------------------------------------------------------------------
-- Loans: created when the deposit is paid (status pending_approval). All money from the stored
-- quote snapshot. funder_id and profit_snapshot are set at approval (Prompt 13).
-- ---------------------------------------------------------------------------
create table public.loans (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null unique references public.applications (id) on delete restrict,
  consumer_id      uuid not null references public.profiles (id) on delete restrict,
  quote_id         uuid references public.quotes (id) on delete set null,
  funder_id        uuid references public.funders (id) on delete set null,
  system_price     numeric(14,2) not null,
  cost_price       numeric(14,2) not null,
  deposit          numeric(14,2) not null,
  balance          numeric(14,2) not null,
  tenure           integer not null check (tenure in (3, 6, 9, 12)),
  start_date       date,
  status           public.loan_status not null default 'pending_approval',
  -- false = no working direct-debit mandate: the customer pays each month from the dashboard
  auto_pay         boolean not null default false,
  profit_snapshot  jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger loans_updated_at before update on public.loans
  for each row execute function public.set_updated_at();
create index loans_consumer_idx on public.loans (consumer_id);

create table public.repayment_schedule (
  id           uuid primary key default gen_random_uuid(),
  loan_id      uuid not null references public.loans (id) on delete cascade,
  n            integer not null check (n >= 1),
  due_date     date not null,
  amount       numeric(14,2) not null check (amount >= 0),
  paid_amount  numeric(14,2) not null default 0 check (paid_amount >= 0),
  status       public.schedule_status not null default 'due',
  paid_at      timestamptz,
  unique (loan_id, n)
);

-- ---------------------------------------------------------------------------
-- Direct-debit mandates. provider_ref = the provider's reusable authorization code.
-- ---------------------------------------------------------------------------
create table public.mandates (
  id              uuid primary key default gen_random_uuid(),
  consumer_id     uuid not null references public.profiles (id) on delete cascade,
  application_id  uuid references public.applications (id) on delete set null,
  provider        text not null,
  init_reference  text not null unique,
  provider_ref    text,
  bank_name       text,
  account_last4   text check (account_last4 is null or account_last4 ~ '^[0-9]{4}$'),
  status          public.mandate_status not null default 'pending',
  failure_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger mandates_updated_at before update on public.mandates
  for each row execute function public.set_updated_at();
create index mandates_consumer_idx on public.mandates (consumer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Payments. One row per reference; provider_event_id makes webhooks idempotent
-- (the same event twice = one effect). fee = what the provider charged (Go4Solar absorbs it).
-- ---------------------------------------------------------------------------
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_event_id  text unique,
  reference          text not null unique,
  kind               public.payment_kind not null,
  consumer_id        uuid not null references public.profiles (id) on delete restrict,
  application_id     uuid references public.applications (id) on delete set null,
  loan_id            uuid references public.loans (id) on delete set null,
  schedule_id        uuid references public.repayment_schedule (id) on delete set null,
  -- the payment this refund returns
  refund_of          uuid references public.payments (id) on delete set null,
  amount             numeric(14,2) not null check (amount > 0),
  fee                numeric(14,2) not null default 0,
  status             public.payment_status not null default 'pending',
  channel            text,
  paid_at            timestamptz,
  raw                jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create index payments_consumer_idx on public.payments (consumer_id, created_at desc);
create index payments_application_idx on public.payments (application_id);

-- ---------------------------------------------------------------------------
-- RLS: customers read their own; staff read; no client writes (service role only).
-- ---------------------------------------------------------------------------
alter table public.loans               enable row level security;
alter table public.repayment_schedule  enable row level security;
alter table public.mandates            enable row level security;
alter table public.payments            enable row level security;

create policy "loans: own read" on public.loans for select using (consumer_id = auth.uid());
create policy "loans: staff read" on public.loans for select using (public.is_staff());

create policy "schedule: own read" on public.repayment_schedule for select using (
  exists (select 1 from public.loans l where l.id = repayment_schedule.loan_id and l.consumer_id = auth.uid())
);
create policy "schedule: staff read" on public.repayment_schedule for select using (public.is_staff());

create policy "mandates: own read" on public.mandates for select using (consumer_id = auth.uid());
create policy "mandates: staff read" on public.mandates for select using (public.is_staff());

create policy "payments: own read" on public.payments for select using (consumer_id = auth.uid());
create policy "payments: staff read" on public.payments for select using (public.is_staff());

-- Days within which a declined applicant's deposit is refunded (admin-set).
insert into public.settings (key, value) values ('refund_days', '5') on conflict (key) do nothing;
