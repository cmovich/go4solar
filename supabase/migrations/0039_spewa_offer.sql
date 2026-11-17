-- SPEWA offer for businesses and institutions. Adds only (nothing dropped or renamed).
--
-- * spewa_price_items: SPEWA's price list (57 items from the 9 Nov 2026 list are loaded by
--   `npm run spewa:load`, NOT by this migration: partner prices stay out of the repository).
--   Five price columns (showroom, installer, level_b, level_a, big_dealer; empty = no price),
--   what the item is for the sizing engine and the builder (inverter kW + voltage, battery kWh +
--   voltage, panel W, light W; high-voltage items flagged), switched on/off, order.
--   RLS: super admin and finance read (partner prices are costs); writes are server-only;
--   every change is audited (0020 trigger).
-- * settings.spewa_offer: which column is the PARTNER price (SPEWA's equipment cost, default
--   big_dealer) and which is the SELLING price to customers (default installer), the price list
--   date, quote validity (7 days), the financing charge per length (7.5% / 15% / 22.5% / 30% of
--   the financed amount for 3 / 6 / 9 / 12 months), the bad-debt provision (2% of the financed
--   amount) and Go4Solar's share of the profit (50%). Settings changes are audited (0020).
-- * funder_routing_rules: funder, applicant type, minimum deposit, lengths, active, default.
--   Seeded: SPEWA · business (covers institutions) · 30% · 3/6/9/12 · default, from the
--   existing settings.funder_routing (which stays in place, no longer read).
--   RLS: super admin, credit officer and finance read; writes server-only; audited.

create table public.spewa_price_items (
  id           uuid primary key default gen_random_uuid(),
  item_no      integer check (item_no > 0),
  category     text not null check (category in ('Lights', 'Batteries', 'Inverters', 'Solar panels', 'Other')),
  code         text not null unique check (char_length(code) between 1 and 40),
  product      text not null check (char_length(product) between 1 and 200),
  brand        text check (char_length(brand) <= 60),
  warranty     text check (char_length(warranty) <= 40),
  showroom     numeric(14, 2) check (showroom >= 0),
  installer    numeric(14, 2) check (installer >= 0),
  level_b      numeric(14, 2) check (level_b >= 0),
  level_a      numeric(14, 2) check (level_a >= 0),
  big_dealer   numeric(14, 2) check (big_dealer >= 0),
  kind         text not null default 'other'
                 check (kind in ('inverter', 'battery', 'panel', 'light', 'other')),
  -- Inverter rating in kW (used as kVA by the sizing engine).
  rating_kw    numeric(10, 3) check (rating_kw > 0),
  -- Battery / inverter battery voltage; null with high_voltage for HV systems.
  voltage      numeric(8, 2) check (voltage > 0),
  high_voltage boolean not null default false,
  kwh          numeric(10, 3) check (kwh > 0),
  watts        numeric(10, 2) check (watts > 0),
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index spewa_price_items_kind_idx on public.spewa_price_items (kind, active, sort_order);

create trigger spewa_price_items_updated_at before update on public.spewa_price_items
  for each row execute function public.set_updated_at();

alter table public.spewa_price_items enable row level security;
create policy "spewa_price_items: super_admin and finance read" on public.spewa_price_items
  for select to authenticated
  using (public.my_role()::text in ('super_admin', 'finance'));
revoke insert, update, delete on public.spewa_price_items from anon, authenticated;

create trigger audit_changes after insert or update or delete on public.spewa_price_items
  for each row execute function public.audit_row_change('all');

insert into public.settings (key, value) values (
  'spewa_offer',
  jsonb_build_object(
    'partnerColumn', 'big_dealer',
    'sellingColumn', 'installer',
    'priceListDate', '2026-11-09',
    'validityDays', 7,
    'chargeByTenure', jsonb_build_object('3', 0.075, '6', 0.15, '9', 0.225, '12', 0.3),
    'badDebtShare', 0.02,
    'go4solarShare', 0.5
  )
) on conflict (key) do nothing;

create table public.funder_routing_rules (
  id                uuid primary key default gen_random_uuid(),
  funder_id         uuid not null references public.funders (id),
  applicant_type    text not null check (applicant_type in ('individual', 'business')),
  min_deposit_share numeric(6, 4) not null check (min_deposit_share >= 0.2 and min_deposit_share <= 0.95),
  tenures           integer[] not null
                      check (cardinality(tenures) > 0 and tenures <@ array[3, 6, 9, 12, 18, 24]),
  -- The offer customers of this type are priced with ('spewa': SPEWA price list + charges).
  offer             text check (offer in ('spewa')),
  is_default        boolean not null default false,
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- At most one active default rule per applicant type (it sets that type's offer).
create unique index funder_routing_rules_default_idx
  on public.funder_routing_rules (applicant_type) where is_default and active;

create trigger funder_routing_rules_updated_at before update on public.funder_routing_rules
  for each row execute function public.set_updated_at();

alter table public.funder_routing_rules enable row level security;
create policy "funder_routing_rules: staff read" on public.funder_routing_rules
  for select to authenticated
  using (public.my_role()::text in ('super_admin', 'credit_officer', 'finance'));
revoke insert, update, delete on public.funder_routing_rules from anon, authenticated;

create trigger audit_changes after insert or update or delete on public.funder_routing_rules
  for each row execute function public.audit_row_change('all');

insert into public.funder_routing_rules
  (funder_id, applicant_type, min_deposit_share, tenures, offer, is_default, active, sort_order)
select (value ->> 'funderId')::uuid, 'business', 0.3, array[3, 6, 9, 12], 'spewa', true, true, 1
from public.settings
where key = 'funder_routing' and value ->> 'funderId' is not null;
