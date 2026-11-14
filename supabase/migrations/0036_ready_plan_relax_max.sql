-- Ready-made plan 7: Relax Max (Semako, 14 Nov). Adds one row; nothing dropped or renamed.
--
-- SAMPLE until a super admin confirms the prices in Admin → Pricing → Ready-made plans (no naira
-- is shown to customers before that). Ordered straight after Relax. Uses Relax's current photo
-- for now (copied from that row; replace it in admin). Lithium-ion, 48 V, Kaduna delivery included.
-- Price ₦6,082,000 (vendor cost ₦5,314,000). Added SWITCHED OFF (active = false): customers see it
-- only after a super admin switches it on. If the slug already exists nothing changes.

insert into public.ready_plans
  (slug, name, summary, system_voltage, inverter_kva, image, lines, can_power, backup,
   full_discount, admin_note, sort_order, active, sample)
select
  'relax-max', 'Relax Max', '12 kW · 17.5 kWh lithium-ion · 18 × 650 W · 48 V', 48, 12,
  (select image from public.ready_plans where slug = 'relax'),
  '[{"kind": "inverter", "name": "Inverter", "spec": "12 kW 48 V", "qty": 1, "vendorCost": 780000, "price": 950000}, {"kind": "battery", "name": "Battery", "spec": "17.5 kWh lithium-ion 48 V", "qty": 1, "vendorCost": 2100000, "price": 2300000}, {"kind": "panels", "name": "Solar panels", "spec": "650 W", "qty": 18, "vendorCost": 2160000, "price": 2430000}, {"kind": "cable", "name": "DC cable", "spec": "30 yd", "qty": 1, "vendorCost": 135000, "price": 165000}, {"kind": "cable", "name": "AC cable", "spec": "15 yd", "qty": 1, "vendorCost": 30000, "price": 30000}, {"kind": "box", "name": "Breaker box", "spec": "9-way", "qty": 1, "vendorCost": 5000, "price": 10000}, {"kind": "breakers", "name": "AC/DC breakers", "spec": "", "qty": 2, "vendorCost": 10000, "price": 20000}, {"kind": "accessories", "name": "Accessories", "spec": "", "qty": 1, "vendorCost": 15000, "price": 20000}, {"kind": "installation", "name": "Installation", "spec": "", "qty": 1, "vendorCost": 50000, "price": 100000}, {"kind": "logistics", "name": "Delivery (Kaduna)", "spec": "", "qty": 1, "vendorCost": 10000, "price": 30000}, {"kind": "breakers", "name": "Changeover switch", "spec": "", "qty": 1, "vendorCost": 3000, "price": 7000}, {"kind": "surge", "name": "AC/DC surge protection", "spec": "", "qty": 1, "vendorCost": 16000, "price": 20000}]'::jsonb,
  '["Whole home or small business", "2–3 air conditioners (1.5 HP)", "Freezer", "Pumping machine", "Office equipment"]'::jsonb,
  '["About 5 hours with heavy items on", "All night at normal use"]'::jsonb,
  0.2, 'Check the inverter''s max PV input ≥ 11.7 kW.',
  coalesce((select sort_order from public.ready_plans where slug = 'relax'), 6) + 1,
  false, true
on conflict (slug) do nothing;
