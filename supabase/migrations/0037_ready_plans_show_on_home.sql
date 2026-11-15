-- "Show on home page" for ready-made plans (Semako, 14 Nov). Adds one column; nothing dropped
-- or renamed.
--
-- * ready_plans.show_on_home: the plan is shown on the home page straight away; the other
--   switched-on plans appear under "See more plans". New plans start OFF. A plan that is not
--   ticked keeps its own /plans/<name> page and stays in the staff quotation list.
-- * If no plan is ticked the home page shows the first three by order (decided in code).
-- * Ticked now: I Pass My Neighbour, Level Up, Oga Boss. The 0020 audit trigger records it.

alter table public.ready_plans
  add column show_on_home boolean not null default false;

comment on column public.ready_plans.show_on_home is
  'Shown on the home page at once; other switched-on plans appear under "See more plans".';

update public.ready_plans
  set show_on_home = true, updated_at = now()
  where slug in ('i-pass-my-neighbour', 'level-up', 'oga-boss');
