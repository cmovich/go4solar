-- Component specs (Part A): a nominal voltage and the datasheet values per category (inverter,
-- battery, panel; free text for accessories). Only adds columns; existing rows start empty and
-- show "Specs missing" in /admin/pricing/components until filled in. Changes are audited by the
-- existing audit trigger on components.
alter table public.components
  add column nominal_voltage numeric(6, 1)
    check (nominal_voltage is null or (nominal_voltage > 0 and nominal_voltage <= 1000)),
  add column specs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(specs) = 'object');
