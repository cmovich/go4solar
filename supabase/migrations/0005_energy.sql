-- 0005_energy.sql — current energy spend, carbon and repayment advice (Prompt 7c).
-- Never edit this file after it has been pushed; add a new migration instead.

-- ---------------------------------------------------------------------------
-- Energy answers + computed figures per sign-up
-- ---------------------------------------------------------------------------
alter table public.waitlist_consumers add column energy jsonb;

comment on column public.waitlist_consumers.energy is
  'Current energy spend: { generator, weeklyFuelNaira, weeklyGridNaira, petrolShare, source, current: { monthlySpend, litresPerYear, fuelCo2KgPerYear, gridKwhPerYear, gridCo2KgPerYear } | null }';

-- Business rows captured before this change asked for MONTHLY fuel and electricity spend.
-- Move those into the new column as weekly figures (÷ 52 × 12) and drop them from `business`.
update public.waitlist_consumers
set
  energy = jsonb_build_object(
    'source', 'business_monthly',
    'generator', null,
    'weeklyFuelNaira', round((coalesce((business ->> 'generatorSpendMonthly')::numeric, 0) * 12 / 52)),
    'weeklyGridNaira', round((coalesce((business ->> 'electricitySpendMonthly')::numeric, 0) * 12 / 52)),
    'petrolShare', null,
    'current', null
  ),
  business = (business - 'generatorSpendMonthly') - 'electricitySpendMonthly'
where business is not null
  and (business ? 'generatorSpendMonthly' or business ? 'electricitySpendMonthly');

-- ---------------------------------------------------------------------------
-- Settings: fuel prices, emission factors, grid tariff and factor (admin-editable later).
-- Fuel prices and the tariff are SAMPLE values; the grid factor is UNVERIFIED until confirmed
-- against a published Nigerian grid emission factor.
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('energy', '{
    "sample": true,
    "fuelPricePerLitre": { "petrol": 1000, "diesel": 1200 },
    "emissionFactorKgPerLitre": { "petrol": 2.31, "diesel": 2.66 },
    "grid": { "tariffPerKwh": 210, "factorKgPerKwh": 0.40, "verified": false }
  }')
on conflict (key) do nothing;
