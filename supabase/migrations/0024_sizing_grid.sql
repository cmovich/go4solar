-- Part B: sizing engine rework + grid supply.
-- Adds one table (sun_hours), columns on appliance_library / waitlist_consumers / quotes, and
-- replaces the settings.sizing value. Nothing is dropped or renamed; stored estimates and quotes
-- keep their own snapshots, so old figures never change.

-- 1. Peak sun hours per state (kWh/m²/day): yearly average and rainy season. SAMPLE values from
--    profilesolar.com for Lagos, Abuja, Kaduna, Kano and Port Harcourt; every other state copies
--    the nearest of those cities until confirmed in /admin/pricing.
create table public.sun_hours (
  state       text primary key,
  annual_psh  numeric(4,2) not null check (annual_psh > 0 and annual_psh <= 10),
  rainy_psh   numeric(4,2) not null check (rainy_psh > 0 and rainy_psh <= 10),
  source      text not null default '',
  sample      boolean not null default true,
  updated_at  timestamptz not null default now()
);
comment on table public.sun_hours is
  'Peak sun hours per state. Essentials/Comfort use annual_psh, 24-hour plans rainy_psh (Part B).';
create trigger sun_hours_updated_at before update on public.sun_hours
  for each row execute function public.set_updated_at();
create trigger audit_changes after insert or update or delete on public.sun_hours
  for each row execute function public.audit_row_change('all');

alter table public.sun_hours enable row level security;
create policy "sun_hours: staff read" on public.sun_hours for select using (public.is_staff());
create policy "sun_hours: super_admin write" on public.sun_hours for all
  using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

insert into public.sun_hours (state, annual_psh, rainy_psh, source) values
  ('Abia', 4.64, 4.01, 'Port Harcourt (nearest measured city)'),
  ('FCT', 5.90, 4.81, 'Abuja'),
  ('Adamawa', 6.63, 5.95, 'Kano (nearest measured city)'),
  ('Akwa Ibom', 4.64, 4.01, 'Port Harcourt (nearest measured city)'),
  ('Anambra', 4.64, 4.01, 'Port Harcourt (nearest measured city)'),
  ('Bauchi', 6.63, 5.95, 'Kano (nearest measured city)'),
  ('Bayelsa', 4.64, 4.01, 'Port Harcourt (nearest measured city)'),
  ('Benue', 5.90, 4.81, 'Abuja (nearest measured city)'),
  ('Borno', 6.63, 5.95, 'Kano (nearest measured city)'),
  ('Cross River', 4.64, 4.01, 'Port Harcourt (nearest measured city)'),
  ('Delta', 4.64, 4.01, 'Port Harcourt (nearest measured city)'),
  ('Ebonyi', 4.64, 4.01, 'Port Harcourt (nearest measured city)'),
  ('Edo', 4.64, 4.01, 'Port Harcourt (nearest measured city)'),
  ('Ekiti', 5.09, 4.46, 'Lagos (nearest measured city)'),
  ('Enugu', 4.64, 4.01, 'Port Harcourt (nearest measured city)'),
  ('Gombe', 6.63, 5.95, 'Kano (nearest measured city)'),
  ('Imo', 4.64, 4.01, 'Port Harcourt (nearest measured city)'),
  ('Jigawa', 6.63, 5.95, 'Kano (nearest measured city)'),
  ('Kaduna', 6.29, 5.30, 'Kaduna'),
  ('Kano', 6.63, 5.95, 'Kano'),
  ('Katsina', 6.63, 5.95, 'Kano (nearest measured city)'),
  ('Kebbi', 6.29, 5.30, 'Kaduna (nearest measured city)'),
  ('Kogi', 5.90, 4.81, 'Abuja (nearest measured city)'),
  ('Kwara', 5.09, 4.46, 'Lagos (nearest measured city)'),
  ('Lagos', 5.09, 4.46, 'Lagos'),
  ('Nasarawa', 5.90, 4.81, 'Abuja (nearest measured city)'),
  ('Niger', 5.90, 4.81, 'Abuja (nearest measured city)'),
  ('Ogun', 5.09, 4.46, 'Lagos (nearest measured city)'),
  ('Ondo', 5.09, 4.46, 'Lagos (nearest measured city)'),
  ('Osun', 5.09, 4.46, 'Lagos (nearest measured city)'),
  ('Oyo', 5.09, 4.46, 'Lagos (nearest measured city)'),
  ('Plateau', 6.29, 5.30, 'Kaduna (nearest measured city)'),
  ('Rivers', 4.64, 4.01, 'Port Harcourt'),
  ('Sokoto', 6.29, 5.30, 'Kaduna (nearest measured city)'),
  ('Taraba', 5.90, 4.81, 'Abuja (nearest measured city)'),
  ('Yobe', 6.63, 5.95, 'Kano (nearest measured city)'),
  ('Zamfara', 6.29, 5.30, 'Kaduna (nearest measured city)');

-- 2. Appliance defaults: hours in the day, hours at night, and whether it is usually essential.
alter table public.appliance_library
  add column default_day_hours numeric(4,2) check (default_day_hours between 0 and 24),
  add column default_night_hours numeric(4,2) check (default_night_hours between 0 and 24),
  add column default_essential boolean not null default false;

-- Day/night split of the existing hours: all-day items 12/12; lighting at night; kitchen,
-- laundry, water/outdoor and business items in the day; TV/electronics and cooling 40% day /
-- 60% night (rounded to half hours). Admin can change every default in /admin/appliances.
update public.appliance_library set
  default_day_hours = case
    when default_hours >= 24 then 12
    when category = 'lighting' then 0
    when category in ('kitchen', 'laundry', 'water_outdoor', 'business') then least(default_hours, 12)
    else default_hours - least(round(default_hours * 0.6 * 2) / 2, 12)
  end,
  default_night_hours = case
    when default_hours >= 24 then 12
    when category = 'lighting' then least(default_hours, 12)
    when category in ('kitchen', 'laundry', 'water_outdoor', 'business') then 0
    else least(round(default_hours * 0.6 * 2) / 2, 12)
  end;
alter table public.appliance_library
  alter column default_day_hours set not null,
  alter column default_night_hours set not null,
  add constraint appliance_library_day_night_check
    check (default_day_hours + default_night_hours <= 24);

-- Pre-ticked "Essential" (Semako): lights, fans, TVs and phone charging. Same rule as
-- defaultEssential() in src/lib/load/essential.ts; admin can change any row.
update public.appliance_library set default_essential = true
where category = 'lighting'
   or name ~* '\mfan\M' or name ~* '\mTV\M' or name ~* 'phone charg';

-- 3. Grid supply at the customer's site (asked by the quote wizard, Part E):
--    { mode: A|B|C|D, pattern: daily|some_days|uncertain|blackout, dayHours, nightHours }.
alter table public.waitlist_consumers add column grid jsonb;
alter table public.quotes add column grid jsonb;

-- 4. Sizing settings (Part B). Replaces the whole value: headroom, backupHours, chargeHours,
--    inverterSizesKva (stock comes from the components) and the unused pshByState are retired.
update public.settings set value = '{
  "powerFactor": 0.8,
  "dod": 0.9,
  "inverterEfficiency": 0.9,
  "refillEfficiency": 0.95,
  "panelDerate": 0.77,
  "panelWatts": 550,
  "batteryStepKwh": 2.5,
  "nightHours": 12,
  "planNightHours": { "essential": 8, "comfort": 8 },
  "minBackupFullLoadHours": 1,
  "noGridDayMinHours": { "essential": 4, "comfort": 4, "independence": 6 },
  "grid": {
    "acChargeAmps": 40,
    "chargeVoltageFactor": 1.1,
    "chargeEfficiency": 0.9,
    "timingFactor": 0.5,
    "confidence": 1,
    "uncertainNightHours": 1
  },
  "vocSafetyFactor": 1.05,
  "allowRoundDown": false,
  "nightShare": 0.6
}'::jsonb
where key = 'sizing';
