-- Accessories pack "up to 2 kVA" (Semako, 2026-11-17). Adds one row; nothing else changes.
--
-- A components row like the other packs (category accessories, kind 'pack', size in
-- stock_sizes.maxKva). Plans and the builder already pick the smallest pack that covers the
-- inverter, so once it is switched on, inverters up to 2 kVA use it and bigger ones keep the
-- current pack (ACC-7.5).
--
-- SAMPLE cost (₦120,000) and SWITCHED OFF: an active SAMPLE row hides every website price
-- (sampleStatus.ts). Semako sets the cost in Admin → Pricing → Components and switches it on;
-- saving the row clears SAMPLE. The 0020 audit trigger records the insert.

insert into public.components
  (sku, name, category, unit_cost, stock_sizes, source, active, sample, kind, unit, specs)
select 'ACC-2', 'Protection, cables and mounting (≤ 2 kVA)', 'accessories', 120000,
       jsonb_build_object('maxKva', 2), 'oem', false, true, 'pack', 'each', '{}'::jsonb
where not exists (select 1 from public.components where sku = 'ACC-2');
