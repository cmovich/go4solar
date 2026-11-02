-- Part F: the system builder (/build) and its catalogue: itemised accessories, auto-pick rules,
-- racks, logistics and installation extras. Only adds columns, tables and rows; nothing is
-- dropped or renamed.
--
-- Prices on the day this is applied: the new accessory items are seeded INACTIVE, so quotes keep
-- the current accessories pack until staff check the prices and switch items on. Logistics is
-- seeded SAMPLE: while any logistics row is SAMPLE, the website hides prices (same safety net as
-- installation) until staff confirm them in /admin/pricing.

-- 1. Catalogue: accessory kinds, ratings, per-metre items, and shop details on every component.
alter table public.components
  add column kind text check (kind is null or kind in (
    'pack', 'dc_breaker', 'ac_breaker', 'dc_surge', 'ac_surge', 'battery_breaker',
    'voltage_regulator', 'changeover', 'breaker_box', 'trunk_pipe', 'flex_pipe',
    'ac_wire', 'dc_wire')),
  -- amps (breakers, changeover), volts (DC surge), kA (AC surge), kVA (regulator), ways (box),
  -- mm (pipes), mm² (wires)
  add column rating numeric(10,2) check (rating is null or rating > 0),
  add column unit text not null default 'each' check (unit in ('each', 'metre')),
  add column brand text check (brand is null or char_length(brand) <= 80),
  add column description text check (description is null or char_length(description) <= 300),
  add column photo text;  -- path in the site-media bucket
comment on column public.components.kind is
  'Accessory type for the builder and auto-pick; pack = the old "protection, cables and mounting" tier.';

-- The existing accessories tiers are the "pack".
update public.components set kind = 'pack' where category = 'accessories';

-- SAMPLE accessory items, inactive until staff check the price and switch them on.
insert into public.components (sku, name, category, unit_cost, stock_sizes, active, sample, kind, rating, unit, description) values
  ('DCB-32',  'DC breaker 32 A',            'accessories',  9000, '{}', false, true, 'dc_breaker', 32, 'each', 'Protects the panel wiring'),
  ('DCB-63',  'DC breaker 63 A',            'accessories', 14000, '{}', false, true, 'dc_breaker', 63, 'each', 'Protects the panel wiring'),
  ('DCB-125', 'DC breaker 125 A',           'accessories', 25000, '{}', false, true, 'dc_breaker', 125, 'each', 'Protects the panel wiring'),
  ('ACB-32',  'AC breaker 32 A',            'accessories',  6000, '{}', false, true, 'ac_breaker', 32, 'each', 'Protects the house wiring'),
  ('ACB-63',  'AC breaker 63 A',            'accessories',  9000, '{}', false, true, 'ac_breaker', 63, 'each', 'Protects the house wiring'),
  ('ACB-100', 'AC breaker 100 A',           'accessories', 15000, '{}', false, true, 'ac_breaker', 100, 'each', 'Protects the house wiring'),
  ('DCS-500', 'DC surge protector 500 V',   'accessories', 15000, '{}', false, true, 'dc_surge', 500, 'each', 'Guards the panels against lightning surges'),
  ('DCS-1000','DC surge protector 1000 V',  'accessories', 22000, '{}', false, true, 'dc_surge', 1000, 'each', 'Guards the panels against lightning surges'),
  ('ACS-20',  'AC surge protector 20 kA',   'accessories', 12000, '{}', false, true, 'ac_surge', 20, 'each', 'Guards your appliances against grid surges'),
  ('ACS-40',  'AC surge protector 40 kA',   'accessories', 18000, '{}', false, true, 'ac_surge', 40, 'each', 'Guards your appliances against grid surges'),
  ('BTB-125', 'Battery breaker 125 A',      'accessories', 18000, '{}', false, true, 'battery_breaker', 125, 'each', 'Switches the battery off safely'),
  ('BTB-250', 'Battery breaker 250 A',      'accessories', 28000, '{}', false, true, 'battery_breaker', 250, 'each', 'Switches the battery off safely'),
  ('BTB-400', 'Battery breaker 400 A',      'accessories', 45000, '{}', false, true, 'battery_breaker', 400, 'each', 'Switches the battery off safely'),
  ('CHG-63',  'Changeover switch 63 A',     'accessories', 20000, '{}', false, true, 'changeover', 63, 'each', 'Switches between grid, solar and generator'),
  ('CHG-125', 'Changeover switch 125 A',    'accessories', 35000, '{}', false, true, 'changeover', 125, 'each', 'Switches between grid, solar and generator'),
  ('VRG-5',   'Voltage regulator 5 kVA',    'accessories', 85000, '{}', false, true, 'voltage_regulator', 5, 'each', 'Steadies the grid voltage'),
  ('VRG-10',  'Voltage regulator 10 kVA',   'accessories', 150000, '{}', false, true, 'voltage_regulator', 10, 'each', 'Steadies the grid voltage'),
  ('VRG-20',  'Voltage regulator 20 kVA',   'accessories', 260000, '{}', false, true, 'voltage_regulator', 20, 'each', 'Steadies the grid voltage'),
  ('BOX-4',   'Breaker box 4 ways',         'accessories', 10000, '{}', false, true, 'breaker_box', 4, 'each', 'Holds the breakers'),
  ('BOX-8',   'Breaker box 8 ways',         'accessories', 15000, '{}', false, true, 'breaker_box', 8, 'each', 'Holds the breakers'),
  ('BOX-12',  'Breaker box 12 ways',        'accessories', 22000, '{}', false, true, 'breaker_box', 12, 'each', 'Holds the breakers'),
  ('TRK-25',  'Trunk pipe 25 mm',           'accessories',   800, '{}', false, true, 'trunk_pipe', 25, 'metre', 'Covers cables along walls (per metre)'),
  ('TRK-40',  'Trunk pipe 40 mm',           'accessories',  1200, '{}', false, true, 'trunk_pipe', 40, 'metre', 'Covers cables along walls (per metre)'),
  ('FLX-25',  'Flex pipe 25 mm',            'accessories',   600, '{}', false, true, 'flex_pipe', 25, 'metre', 'Bendable cable cover (per metre)'),
  ('FLX-40',  'Flex pipe 40 mm',            'accessories',   900, '{}', false, true, 'flex_pipe', 40, 'metre', 'Bendable cable cover (per metre)'),
  ('ACW-4',   'AC cable 4 mm²',             'accessories',  1500, '{}', false, true, 'ac_wire', 4, 'metre', 'Inverter to distribution board (per metre)'),
  ('ACW-10',  'AC cable 10 mm²',            'accessories',  3500, '{}', false, true, 'ac_wire', 10, 'metre', 'Inverter to distribution board (per metre)'),
  ('ACW-16',  'AC cable 16 mm²',            'accessories',  5500, '{}', false, true, 'ac_wire', 16, 'metre', 'Inverter to distribution board (per metre)'),
  ('DCW-6',   'DC solar cable 6 mm²',       'accessories',  1200, '{}', false, true, 'dc_wire', 6, 'metre', 'Panels to inverter (per metre)'),
  ('DCW-10',  'DC solar cable 10 mm²',      'accessories',  2200, '{}', false, true, 'dc_wire', 10, 'metre', 'Panels to inverter (per metre)'),
  ('DCW-16',  'DC solar cable 16 mm²',      'accessories',  3500, '{}', false, true, 'dc_wire', 16, 'metre', 'Panels to inverter (per metre)');

-- 2. Auto-pick rules: for systems up to max_kva, the rating of each accessory and the default
--    pipe lengths. SAMPLE values (typical for Nigerian installs) until staff confirm.
create table public.accessory_rules (
  id                  uuid primary key default gen_random_uuid(),
  max_kva             numeric(6,2) not null unique check (max_kva > 0),
  dc_breaker_a        numeric(8,2) not null,
  ac_breaker_a        numeric(8,2) not null,
  dc_surge_v          numeric(8,2) not null,
  ac_surge_ka         numeric(8,2) not null,
  battery_breaker_a   numeric(8,2) not null,
  changeover_a        numeric(8,2) not null,
  regulator_kva       numeric(8,2) not null,
  box_ways            integer not null check (box_ways between 2 and 12),
  trunk_pipe_mm       numeric(8,2) not null,
  flex_pipe_mm        numeric(8,2) not null,
  ac_wire_mm2         numeric(8,2) not null,
  dc_wire_mm2         numeric(8,2) not null,
  trunk_pipe_m        numeric(8,2) not null default 10,
  flex_pipe_m         numeric(8,2) not null default 5,
  sample              boolean not null default true,
  updated_at          timestamptz not null default now()
);
insert into public.accessory_rules
  (max_kva, dc_breaker_a, ac_breaker_a, dc_surge_v, ac_surge_ka, battery_breaker_a, changeover_a,
   regulator_kva, box_ways, trunk_pipe_mm, flex_pipe_mm, ac_wire_mm2, dc_wire_mm2, trunk_pipe_m, flex_pipe_m) values
  (1.5,  32,  32,  500, 20, 125,  63,  5,  4, 25, 25,  4,  6, 10, 5),
  (3.5,  32,  32,  500, 20, 125,  63,  5,  4, 25, 25,  4,  6, 12, 6),
  (5,    63,  63, 1000, 40, 250,  63,  5,  8, 25, 25, 10,  6, 12, 6),
  (7.5,  63,  63, 1000, 40, 250, 125, 10,  8, 40, 40, 10, 10, 15, 8),
  (10,   63, 100, 1000, 40, 250, 125, 10, 12, 40, 40, 16, 10, 15, 8),
  (15,  125, 100, 1000, 40, 400, 125, 20, 12, 40, 40, 16, 16, 20, 10),
  (20,  125, 100, 1000, 40, 400, 125, 20, 12, 40, 40, 16, 16, 20, 10);

-- 3. Racks: price per cm of rail by material (rack cost = panels × panel length × price per cm ×
--    rails per panel + clamps). Treated as equipment (markup applies).
create table public.rack_prices (
  material      text primary key check (material in ('metal', 'aluminium')),
  price_per_cm  numeric(10,2) not null check (price_per_cm >= 0),
  sample        boolean not null default true,
  updated_at    timestamptz not null default now()
);
insert into public.rack_prices (material, price_per_cm) values ('metal', 25), ('aluminium', 40);

-- 4. Logistics: delivery per state (+ an optional amount per panel). While local vendors are not
--    available in a state, Go4Solar delivery is always included. Never marked up.
create table public.logistics_costs (
  state                    text primary key,
  amount                   numeric(14,2) not null check (amount >= 0),
  extra_per_panel          numeric(14,2) not null default 0 check (extra_per_panel >= 0),
  local_vendors_available  boolean not null default false,
  sample                   boolean not null default true,
  updated_at               timestamptz not null default now()
);
insert into public.logistics_costs (state, amount) values ('Other', 50000);

-- 5. Installation extras: per roof type (per panel or per kW) and per storey above ground.
alter table public.roof_types
  add column install_price numeric(14,2) not null default 0 check (install_price >= 0),
  add column install_price_unit text not null default 'per_panel'
    check (install_price_unit in ('per_panel', 'per_kw'));

insert into public.settings (key, value) values
  ('builder', '{
    "railsPerPanel": 1,
    "clampPricePerPanel": 0,
    "extraPerStorey": 0,
    "maxDcVoltageDrop": 0.03,
    "sample": true
  }'::jsonb)
on conflict (key) do nothing;

-- 6. The builder's selection travels with the lead (prelaunch sign-up) and the quote.
alter table public.waitlist_consumers add column builder jsonb;
alter table public.quotes add column builder jsonb;

-- RLS and audit for the new tables: staff read, super admin write, every change logged.
do $$
declare t text;
begin
  foreach t in array array['accessory_rules', 'rack_prices', 'logistics_costs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: staff read" on public.%I for select using (public.is_staff())', t, t);
    execute format('create policy "%s: super_admin write" on public.%I for all using (public.has_role(''super_admin'')) with check (public.has_role(''super_admin''))', t, t);
    execute format(
      'create trigger audit_changes after insert or update or delete on public.%I '
      'for each row execute function public.audit_row_change(%L)', t, 'all');
  end loop;
end $$;
