-- 0014_forecasts.sql — forecast scenarios and per-loan profit snapshots (Quoted / Approved / Actual).
-- Never edit this file after it has been pushed; add a new migration instead.
-- Only super admin and finance see profit and forecasts (PRD "Profitability"); writes are server-side.

create table public.forecast_scenarios (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 2 and 80),
  -- ScenarioInputs (src/lib/forecast/scenario.ts), including which inputs are SAMPLE / unverified
  inputs      jsonb not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger forecast_scenarios_updated_at before update on public.forecast_scenarios
  for each row execute function public.set_updated_at();

create type public.profit_stage as enum ('quoted', 'approved', 'actual');

-- Quoted and Approved once per loan (month null); Actual once per loan per month
-- (filled by /api/cron/profit-actuals from real payments and recorded fees).
create table public.loan_profit_snapshots (
  id          uuid primary key default gen_random_uuid(),
  loan_id     uuid not null references public.loans (id) on delete cascade,
  stage       public.profit_stage not null,
  month       date,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  check ((stage = 'actual') = (month is not null))
);
create unique index loan_profit_snapshots_once
  on public.loan_profit_snapshots (loan_id, stage, coalesce(month, date '1900-01-01'));

alter table public.forecast_scenarios    enable row level security;
alter table public.loan_profit_snapshots enable row level security;

create policy "forecast_scenarios: profit staff read" on public.forecast_scenarios for select
  using (public.has_role('super_admin') or public.has_role('finance'));
create policy "loan_profit_snapshots: profit staff read" on public.loan_profit_snapshots for select
  using (public.has_role('super_admin') or public.has_role('finance'));

-- "What if" calculator: customers one member of staff can serve in a year (admin-set).
insert into public.settings (key, value) values ('customers_per_staff', '250') on conflict (key) do nothing;
