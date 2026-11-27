-- 0046: quote versions for the one-time update to the 4% terms (Semako, 27 Nov 2026).
--
-- The waiting-list row keeps the CURRENT quote (estimate / builder) as now. Before a quote is
-- replaced, the old one is copied here, so nothing is ever overwritten without a trace: staff see
-- it as "Replaced by updated quote (4% terms) on <date>". Rows are only added, never changed.
--
-- sizing_note: a note for the call when today's sizing from the person's appliance list differs
-- clearly from the system they were quoted (their system is NOT changed).
--
-- Staff and Sales read (like the waiting list itself); customers and visitors never; the server
-- writes. Nothing is dropped or renamed.

create table public.waitlist_quote_versions (
  id           uuid primary key default gen_random_uuid(),
  waitlist_id  uuid not null references public.waitlist_consumers (id) on delete cascade,
  version      integer not null check (version >= 1),
  estimate     jsonb,
  builder      jsonb,
  replaced_at  timestamptz not null default now(),
  replaced_by  uuid,
  reason       text not null check (char_length(reason) between 3 and 200),
  is_test      boolean not null default false,
  unique (waitlist_id, version),
  check (estimate is not null or builder is not null)
);
create index waitlist_quote_versions_lead on public.waitlist_quote_versions (waitlist_id);

alter table public.waitlist_quote_versions enable row level security;
create policy "waitlist_quote_versions: staff and sales read" on public.waitlist_quote_versions
  for select to authenticated using (public.is_staff() or public.my_role()::text = 'sales');
revoke insert, update, delete on public.waitlist_quote_versions from anon, authenticated;
create trigger audit_changes after insert or update or delete on public.waitlist_quote_versions
  for each row execute function public.audit_row_change('all');

alter table public.waitlist_consumers
  add column quote_version integer not null default 1 check (quote_version >= 1),
  add column sizing_note   text check (char_length(sizing_note) <= 500);
