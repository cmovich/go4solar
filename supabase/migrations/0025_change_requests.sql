-- "My account": customers ask staff to change their verified details (name, phone, email,
-- address) instead of editing them directly. Staff approve or reject; every decision is audited.
-- Adds two enum types and one table. Nothing is dropped or renamed; no existing data changes.

create type public.change_field as enum ('name', 'phone', 'email', 'address');
create type public.change_status as enum ('pending', 'approved', 'rejected');

create table public.change_requests (
  id             uuid primary key default gen_random_uuid(),
  consumer_id    uuid not null references public.profiles (id) on delete cascade,
  field          public.change_field not null,
  -- what the detail was when the customer asked (shown to staff next to the new value)
  current_value  text,
  new_value      text not null check (char_length(new_value) between 2 and 300),
  reason         text check (reason is null or char_length(reason) <= 300),
  status         public.change_status not null default 'pending',
  decided_by     uuid references public.profiles (id) on delete set null,
  decided_at     timestamptz,
  decision_note  text check (decision_note is null or char_length(decision_note) <= 300),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.change_requests is
  'Customer requests to change verified details; staff approve (applied to the profile/application) or reject.';

-- One open request per detail per customer.
create unique index change_requests_one_pending
  on public.change_requests (consumer_id, field) where status = 'pending';
create index change_requests_status_idx on public.change_requests (status, created_at);

create trigger change_requests_updated_at before update on public.change_requests
  for each row execute function public.set_updated_at();
-- Customers create rows too: only staff changes are logged automatically (the app adds a
-- 'change_request.*' row with the decision as well).
create trigger audit_changes after insert or update or delete on public.change_requests
  for each row execute function public.audit_row_change('staff');

alter table public.change_requests enable row level security;
create policy "change_requests: own read" on public.change_requests
  for select using (consumer_id = auth.uid());
create policy "change_requests: own insert (pending only)" on public.change_requests
  for insert to authenticated
  with check (consumer_id = auth.uid() and status = 'pending' and decided_by is null and decided_at is null);
create policy "change_requests: staff read" on public.change_requests
  for select using (public.is_staff());
-- Decisions are written by the server (service role) after a role check; no browser updates.
