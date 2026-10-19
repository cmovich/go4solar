-- Longer payment plans: 18 and 24 months, and an on/off switch per tenure.
-- Only widens checks and adds a column and two rows; no column or table is dropped or renamed.
-- 18 and 24 start switched OFF with no rate, so customers never see them until a super admin
-- enters a rate and switches them on in /admin/pricing. Code from before this migration only
-- reads the 3/6/9/12 rows, so it keeps working unchanged.

-- 1. Tenure switch; existing rows (3, 6, 9, 12) stay on.
alter table public.pricing_rates add column enabled boolean not null default true;

-- 2. Allow 18 and 24 months wherever a tenure is stored.
alter table public.pricing_rates drop constraint pricing_rates_tenure_months_check;
alter table public.pricing_rates add constraint pricing_rates_tenure_months_check
  check (tenure_months in (3, 6, 9, 12, 18, 24));

alter table public.funders drop constraint funders_max_tenure_check;
alter table public.funders add constraint funders_max_tenure_check
  check (max_tenure in (3, 6, 9, 12, 18, 24));

alter table public.quotes drop constraint quotes_tenure_check;
alter table public.quotes add constraint quotes_tenure_check
  check (tenure in (3, 6, 9, 12, 18, 24));

alter table public.loans drop constraint loans_tenure_check;
alter table public.loans add constraint loans_tenure_check
  check (tenure in (3, 6, 9, 12, 18, 24));

-- 3. A new tenure has no rate until one is entered ("no margin"); a switched-on tenure must have
--    all three parts, and 12 months (the estimate tenure) always stays on.
alter table public.pricing_rates
  alter column expected_funder_rate drop not null,
  alter column spread drop not null,
  alter column default_buffer drop not null;
alter table public.pricing_rates add constraint pricing_rates_enabled_needs_rate
  check (not enabled or (expected_funder_rate is not null and spread is not null and default_buffer is not null));
alter table public.pricing_rates add constraint pricing_rates_twelve_stays_on
  check (tenure_months <> 12 or enabled);

-- 4. The two new tenures, switched off with no rate.
insert into public.pricing_rates (tenure_months, enabled, expected_funder_rate, spread, default_buffer, sample)
values (18, false, null, null, null, false), (24, false, null, null, null, false);
