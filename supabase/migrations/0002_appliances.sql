-- 0002_appliances.sql — appliance library (PRD Feature 3) and a shared rate-limit table.
-- Never edit this file after it has been pushed; add a new migration instead.

-- ---------------------------------------------------------------------------
-- Appliance library
-- ---------------------------------------------------------------------------
create type public.appliance_category as enum (
  'lighting',
  'tv_electronics',
  'kitchen',
  'cooling',
  'laundry',
  'water_outdoor',
  'business'
);

create table public.appliance_library (
  id             uuid primary key default gen_random_uuid(),
  category       public.appliance_category not null,
  name           text not null,
  default_watts  integer not null check (default_watts between 1 and 10000),
  surge_factor   numeric(4,2) not null default 1 check (surge_factor >= 1),
  duty_cycle     numeric(3,2) not null default 1 check (duty_cycle > 0 and duty_cycle <= 1),
  default_hours  numeric(4,2) not null check (default_hours >= 0 and default_hours <= 24),
  sort           integer not null default 0,
  active         boolean not null default true,
  unique (category, name)
);

comment on table public.appliance_library is 'Appliances the calculator offers, with typical watts. Admin edits every default.';

create index appliance_library_category_idx on public.appliance_library (category, sort);

alter table public.appliance_library enable row level security;

create policy "appliance_library: read all"
  on public.appliance_library for select
  using (true);

create policy "appliance_library: super_admin write"
  on public.appliance_library for all
  using (public.has_role('super_admin'))
  with check (public.has_role('super_admin'));

-- Seed from the PRD categories table. Surge 3 for motors (fridges, freezers, pumps, ACs,
-- washing machines, air cooler); duty 0.4 fridges/freezers, 0.5 ACs, 1 otherwise.
insert into public.appliance_library (category, name, default_watts, surge_factor, duty_cycle, default_hours, sort) values
  -- Lighting
  ('lighting', 'LED bulb',                10, 1, 1,  6, 10),
  ('lighting', 'Energy-saver bulb',       20, 1, 1,  6, 20),
  ('lighting', 'Incandescent bulb',       60, 1, 1,  6, 30),
  ('lighting', 'Fluorescent tube',        36, 1, 1,  6, 40),
  ('lighting', 'LED tube',                18, 1, 1,  6, 50),
  ('lighting', 'Security / flood light',  50, 1, 1, 12, 60),
  -- TV and Electronics
  ('tv_electronics', '32" TV',             50, 1, 1,  6, 10),
  ('tv_electronics', '43" TV',             80, 1, 1,  6, 20),
  ('tv_electronics', '55" TV',            120, 1, 1,  6, 30),
  ('tv_electronics', 'Decoder',            20, 1, 1,  6, 40),
  ('tv_electronics', 'Sound system',      100, 1, 1,  3, 50),
  ('tv_electronics', 'Soundbar',           40, 1, 1,  3, 60),
  ('tv_electronics', 'Game console',      150, 1, 1,  3, 70),
  ('tv_electronics', 'Wi-Fi router',       10, 1, 1, 24, 80),
  ('tv_electronics', 'Starlink',           75, 1, 1, 24, 90),
  ('tv_electronics', 'CCTV / DVR',         40, 1, 1, 24, 100),
  ('tv_electronics', 'Laptop',             65, 1, 1,  6, 110),
  ('tv_electronics', 'Desktop + monitor', 200, 1, 1,  6, 120),
  ('tv_electronics', 'Printer',            50, 1, 1,  1, 130),
  ('tv_electronics', 'Phone charger',      10, 1, 1,  3, 140),
  -- Kitchen Appliances
  ('kitchen', 'Fridge',                     150, 3, 0.4, 24, 10),
  ('kitchen', 'Chest freezer',              200, 3, 0.4, 24, 20),
  ('kitchen', 'Double-door fridge',         250, 3, 0.4, 24, 30),
  ('kitchen', 'Blender',                    400, 1, 1, 0.25, 40),
  ('kitchen', 'Microwave',                 1000, 1, 1,  0.5, 50),
  ('kitchen', 'Electric cooker (per plate)', 1500, 1, 1, 1, 60),
  ('kitchen', 'Electric oven',             2000, 1, 1,    1, 70),
  ('kitchen', 'Kettle',                    1500, 1, 1,  0.5, 80),
  ('kitchen', 'Toaster',                    800, 1, 1, 0.25, 90),
  ('kitchen', 'Rice cooker',                700, 1, 1,    1, 100),
  ('kitchen', 'Air fryer',                 1500, 1, 1,  0.5, 110),
  ('kitchen', 'Water dispenser',            100, 1, 1,    8, 120),
  -- Cooling and Comfort
  ('cooling', 'Standing fan',        60, 1, 1,   8, 10),
  ('cooling', 'Ceiling fan',         75, 1, 1,   8, 20),
  ('cooling', 'Air cooler',         150, 3, 1,   8, 30),
  ('cooling', 'AC 1 HP',            900, 3, 0.5, 8, 40),
  ('cooling', 'AC 1.5 HP',         1300, 3, 0.5, 8, 50),
  ('cooling', 'AC 2 HP',           1800, 3, 0.5, 8, 60),
  ('cooling', 'Inverter AC 1.5 HP', 900, 3, 0.5, 8, 70),
  -- Laundry and Home Care
  ('laundry', 'Washing machine',  500, 3, 1,    1, 10),
  ('laundry', 'Pressing iron',   1200, 1, 1,  0.5, 20),
  ('laundry', 'Vacuum cleaner',  1000, 1, 1,  0.5, 30),
  ('laundry', 'Hair dryer',      1200, 1, 1, 0.25, 40),
  ('laundry', 'Water heater',    3000, 1, 1,    1, 50),
  -- Water and Outdoor
  ('water_outdoor', 'Surface pump 0.5 HP', 370, 3, 1,    1, 10),
  ('water_outdoor', 'Surface pump 1 HP',   750, 3, 1,    1, 20),
  ('water_outdoor', 'Borehole pump 1 HP',  750, 3, 1,    1, 30),
  ('water_outdoor', 'Gate motor',          300, 1, 1, 0.25, 40),
  ('water_outdoor', 'Electric fence',       10, 1, 1,   24, 50),
  -- Business and Office (SME)
  ('business', 'Sewing machine',      100, 1, 1,    6, 10),
  ('business', 'Barbing clipper',      15, 1, 1,    6, 20),
  ('business', 'POS terminal',         10, 1, 1,   12, 30),
  ('business', 'Photocopier',        1500, 1, 1,    2, 40),
  ('business', 'Commercial freezer',  400, 3, 0.4, 24, 50),
  ('business', 'Display fridge',      300, 3, 0.4, 24, 60);

-- ---------------------------------------------------------------------------
-- Rate limits (fixed windows). Server code only: no policies, service role bypasses RLS.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;

-- Counts one hit for p_key in the current window of length p_window.
-- Returns true while the count is within p_limit, false once it is exceeded.
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_secs  double precision := extract(epoch from p_window);
  v_window_start timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / v_window_secs) * v_window_secs);
  v_count        integer;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Tidy this key's old windows so the table never grows without bound.
  delete from public.rate_limits
  where key = p_key and window_start < v_window_start - p_window;

  return v_count <= p_limit;
end;
$$;

revoke execute on function public.hit_rate_limit(text, integer, interval) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, interval) to service_role;
