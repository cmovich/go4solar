-- 0006_pricing.sql — pricing tables (single source of truth), funders, unit costs, overheads.
-- Moves the SAMPLE price list out of settings.price_list / settings.pricing into real tables.
-- Never edit this file after it has been pushed; add a new migration instead.

create type public.component_category as enum ('panels', 'battery', 'inverter', 'accessories');
create type public.component_source as enum ('oem', 'vendor');
create type public.funder_kind as enum ('external', 'own_fund');
create type public.funder_method as enum ('flat', 'reducing');
create type public.funder_status as enum ('active', 'paused');
create type public.size_band as enum ('small', 'medium', 'large');

-- ---------------------------------------------------------------------------
-- Components (admin price list)
-- ---------------------------------------------------------------------------
create table public.components (
  id           uuid primary key default gen_random_uuid(),
  sku          text not null unique,
  name         text not null,
  category     public.component_category not null,
  unit_cost    numeric(14,2) not null check (unit_cost >= 0),
  -- Size the sizing engine matches on: {"watts":550} | {"kwh":2.5} | {"kva":1} | {"maxKva":1.5}
  stock_sizes  jsonb not null default '{}'::jsonb,
  source       public.component_source not null default 'oem',
  active       boolean not null default true,
  sample       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger components_updated_at before update on public.components
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Base margin per category (decimal share: 0.125 = 12.5%)
-- ---------------------------------------------------------------------------
create table public.category_margins (
  category    public.component_category primary key,
  margin      numeric(6,4) not null check (margin >= 0 and margin <= 2),
  sample      boolean not null default false,
  updated_at  timestamptz not null default now()
);
create trigger category_margins_updated_at before update on public.category_margins
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pricing rate per tenure = expected funder rate + Go4Solar spread + default buffer
-- ---------------------------------------------------------------------------
create table public.pricing_rates (
  tenure_months         integer primary key check (tenure_months in (3, 6, 9, 12)),
  expected_funder_rate  numeric(6,4) not null check (expected_funder_rate >= 0),
  spread                numeric(6,4) not null check (spread >= 0),
  default_buffer        numeric(6,4) not null check (default_buffer >= 0),
  pricing_rate          numeric(6,4) generated always as (expected_funder_rate + spread + default_buffer) stored,
  sample                boolean not null default false,
  updated_at            timestamptz not null default now()
);
create trigger pricing_rates_updated_at before update on public.pricing_rates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Installation and logistics per state and size band (small ≤ 3.5 kVA, medium ≤ 7.5, large above)
-- ---------------------------------------------------------------------------
create table public.installation_costs (
  id          uuid primary key default gen_random_uuid(),
  state       text not null,
  size_band   public.size_band not null,
  amount      numeric(14,2) not null check (amount >= 0),
  sample      boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (state, size_band)
);
create trigger installation_costs_updated_at before update on public.installation_costs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Funders
-- ---------------------------------------------------------------------------
create table public.funders (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  kind               public.funder_kind not null default 'external',
  annual_rate        numeric(6,4) not null check (annual_rate >= 0),
  method             public.funder_method not null default 'flat',
  upfront_fee_share  numeric(6,4) not null default 0 check (upfront_fee_share >= 0),
  min_amount         numeric(14,2) not null default 0,
  max_amount         numeric(14,2),
  max_tenure         integer not null default 12 check (max_tenure in (3, 6, 9, 12)),
  balance_available  numeric(14,2) not null default 0,
  status             public.funder_status not null default 'active',
  sample             boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger funders_updated_at before update on public.funders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Unit costs (one row) and monthly overheads
-- ---------------------------------------------------------------------------
create table public.unit_costs (
  id                    integer primary key default 1 check (id = 1),
  kyc_per_loan          numeric(14,2) not null default 0,
  fee_per_instalment    numeric(14,2) not null default 0,
  loss_provision_share  numeric(6,4) not null default 0,
  min_net_margin_share  numeric(6,4) not null default 0,
  sample                boolean not null default false,
  updated_at            timestamptz not null default now()
);
create trigger unit_costs_updated_at before update on public.unit_costs
  for each row execute function public.set_updated_at();

create table public.overheads (
  month              date primary key,
  fixed_amount       numeric(14,2) not null default 0,
  per_system_amount  numeric(14,2) not null default 0,
  sample             boolean not null default false,
  updated_at         timestamptz not null default now()
);
create trigger overheads_updated_at before update on public.overheads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: staff read; super_admin write. Every write goes through a server action that logs to audit_log.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['components','category_margins','pricing_rates','installation_costs','funders','unit_costs','overheads']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: staff read" on public.%I for select using (public.is_staff())', t, t);
    execute format('create policy "%s: super_admin write" on public.%I for all using (public.has_role(''super_admin'')) with check (public.has_role(''super_admin''))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- SAMPLE seed (same figures the waiting list used), flagged sample = true
-- ---------------------------------------------------------------------------
insert into public.components (sku, name, category, unit_cost, stock_sizes, source, sample) values
  ('PNL-550', '550 W solar panel',                'panels',      120000, '{"watts": 550}',  'oem', true),
  ('BAT-2.5', '2.5 kWh lithium battery module',   'battery',     450000, '{"kwh": 2.5}',    'oem', true),
  ('INV-1',   '1 kVA hybrid inverter',            'inverter',    180000, '{"kva": 1}',      'oem', true),
  ('INV-1.5', '1.5 kVA hybrid inverter',          'inverter',    220000, '{"kva": 1.5}',    'oem', true),
  ('INV-2.5', '2.5 kVA hybrid inverter',          'inverter',    350000, '{"kva": 2.5}',    'oem', true),
  ('INV-3.5', '3.5 kVA hybrid inverter',          'inverter',    450000, '{"kva": 3.5}',    'oem', true),
  ('INV-5',   '5 kVA hybrid inverter',            'inverter',    650000, '{"kva": 5}',      'oem', true),
  ('INV-7.5', '7.5 kVA hybrid inverter',          'inverter',    950000, '{"kva": 7.5}',    'oem', true),
  ('INV-10',  '10 kVA hybrid inverter',           'inverter',   1300000, '{"kva": 10}',     'oem', true),
  ('INV-15',  '15 kVA hybrid inverter',           'inverter',   1900000, '{"kva": 15}',     'oem', true),
  ('INV-20',  '20 kVA hybrid inverter',           'inverter',   2500000, '{"kva": 20}',     'oem', true),
  ('ACC-1.5', 'Protection, cables and mounting (≤ 1.5 kVA)', 'accessories',  60000, '{"maxKva": 1.5}', 'oem', true),
  ('ACC-3.5', 'Protection, cables and mounting (≤ 3.5 kVA)', 'accessories', 100000, '{"maxKva": 3.5}', 'oem', true),
  ('ACC-7.5', 'Protection, cables and mounting (≤ 7.5 kVA)', 'accessories', 180000, '{"maxKva": 7.5}', 'oem', true),
  ('ACC-20',  'Protection, cables and mounting (≤ 20 kVA)',  'accessories', 300000, '{"maxKva": 20}',  'oem', true);

insert into public.category_margins (category, margin, sample) values
  ('panels', 0.125, true), ('battery', 0.125, true), ('inverter', 0.125, true), ('accessories', 0.125, true);

-- PRD example: 16% expected funder rate + 6% spread + 2% buffer = 24% for every tenure at launch.
insert into public.pricing_rates (tenure_months, expected_funder_rate, spread, default_buffer, sample) values
  (3, 0.16, 0.06, 0.02, true), (6, 0.16, 0.06, 0.02, true), (9, 0.16, 0.06, 0.02, true), (12, 0.16, 0.06, 0.02, true);

insert into public.installation_costs (state, size_band, amount, sample) values
  ('FCT',    'small', 150000, true), ('FCT',    'medium', 225000, true), ('FCT',    'large', 300000, true),
  ('Kaduna', 'small', 150000, true), ('Kaduna', 'medium', 225000, true), ('Kaduna', 'large', 300000, true),
  ('Lagos',  'small', 200000, true), ('Lagos',  'medium', 300000, true), ('Lagos',  'large', 400000, true),
  ('Other',  'small', 200000, true), ('Other',  'medium', 300000, true), ('Other',  'large', 400000, true);

insert into public.funders (name, kind, annual_rate, method, max_tenure, balance_available, sample) values
  ('SPEWA programme funds', 'external', 0.16, 'flat', 12, 50000000, true),
  ('Trade Lenda',           'external', 0.20, 'flat', 12, 30000000, true),
  ('Go4Solar own fund',     'own_fund', 0.00, 'flat', 12, 10000000, true);

insert into public.unit_costs (id, kyc_per_loan, fee_per_instalment, loss_provision_share, min_net_margin_share, sample)
  values (1, 10000, 300, 0.02, 0.10, true);

insert into public.overheads (month, fixed_amount, per_system_amount, sample)
  values (date_trunc('month', now())::date, 4000000, 40000, true);

-- The tables are now the single source of truth for prices.
delete from public.settings where key in ('price_list', 'pricing');
