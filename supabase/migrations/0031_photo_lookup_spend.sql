-- Part C: photo watts lookup — daily spend cap and settings. Adds only; nothing dropped or renamed.
--
-- * vision_usage: one row per Lagos day with the number of photo lookups and what they cost in
--   naira (from the API's token and web-search counts × the prices in settings.vision). The
--   calculator hides the photo button once the day's spend reaches the cap. Photos are never
--   stored anywhere; only counts and cost.
-- * add_vision_usage(day, cost): adds one lookup atomically and returns the day's new total.
-- * settings.vision (SAMPLE until a super admin saves it): daily cap, per-visitor daily limit,
--   naira per US dollar and the API prices.

create table public.vision_usage (
  day date primary key,
  lookups integer not null default 0 check (lookups >= 0),
  cost_naira numeric(14,2) not null default 0 check (cost_naira >= 0),
  updated_at timestamptz not null default now()
);

alter table public.vision_usage enable row level security;
-- Staff read (admin "Photo lookup" page); only the server writes, through the function below.
create policy "vision_usage: staff read" on public.vision_usage
  for select using (public.is_staff());

create or replace function public.add_vision_usage(p_day date, p_cost numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  total numeric;
begin
  insert into public.vision_usage as v (day, lookups, cost_naira, updated_at)
  values (p_day, 1, greatest(p_cost, 0), now())
  on conflict (day) do update
    set lookups = v.lookups + 1,
        cost_naira = v.cost_naira + greatest(excluded.cost_naira, 0),
        updated_at = now()
  returning cost_naira into total;
  return total;
end $$;

revoke all on function public.add_vision_usage(date, numeric) from public, anon, authenticated;
grant execute on function public.add_vision_usage(date, numeric) to service_role;

insert into public.settings (key, value) values (
  'vision',
  jsonb_build_object(
    'dailyCapNaira', 5000,
    'perVisitorPerDay', 10,
    'nairaPerUsd', 1600,
    'inputUsdPerMTok', 1,
    'outputUsdPerMTok', 5,
    'webSearchUsd', 0.01,
    'sample', true
  )
) on conflict (key) do nothing;
