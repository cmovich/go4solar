-- Staff quotation tool. Adds only; nothing dropped or renamed except one check constraint that is
-- re-created wider (same pattern as 0023).
--
-- * Staff permission 'create_quotations' (given on /admin/staff; super admins always may).
-- * staff_quotations: a quotation a staff member made with the system builder for a customer
--   (name, phone and state optional at creation). Holds the priced snapshot (`builder`, same shape
--   as waitlist_consumers.builder) so later price changes never alter it. `public_code` is the
--   secret in the customer link (/q/<code>). No account, no sign-up, no KYC: when the customer
--   taps "Accept and apply" they give their own details and the normal sign-up / application
--   starts from this quote (accepted_lead_id, and in live mode accepted_quote_id).
-- * RLS: super admins read every row; staff with the permission read the rows they created.
--   Only the server writes (service role, after checking the permission).
-- * Audit: the 0020 trigger records every insert/update/delete (the app adds its own rows too).

-- 1. The permission.
alter table public.staff_permissions drop constraint staff_permissions_permission_check;
alter table public.staff_permissions add constraint staff_permissions_permission_check
  check (permission in ('assisted_entry', 'waitlist_delete', 'create_quotations'));
comment on table public.staff_permissions is
  'Permissions that can be given to any staff role. Known values: assisted_entry, waitlist_delete, create_quotations.';

-- 2. The table.
create table public.staff_quotations (
  id                uuid primary key default gen_random_uuid(),
  public_code       text not null unique check (public_code ~ '^[a-z0-9]{10,16}$'),
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  customer_name     text check (customer_name is null or length(customer_name) between 2 and 120),
  customer_phone    text check (customer_phone is null or customer_phone ~ '^\+234[0-9]{10}$'),
  state             text not null,
  site              jsonb not null default '{}'::jsonb,
  builder           jsonb not null,
  deposit_share     numeric(5,4) not null check (deposit_share >= 0.2 and deposit_share <= 0.95),
  tenure            integer not null check (tenure in (3, 6, 9, 12, 18, 24)),
  total             numeric(14,2) not null check (total >= 0),
  monthly           numeric(14,2) not null check (monthly >= 0),
  sample            boolean not null default false,
  valid_until       timestamptz not null,
  shared_at         timestamptz,
  accepted_at       timestamptz,
  accepted_lead_id  uuid references public.waitlist_consumers (id) on delete set null,
  accepted_quote_id uuid references public.quotes (id) on delete set null,
  is_test           boolean not null default false
);
create index staff_quotations_created_by_idx on public.staff_quotations (created_by, created_at desc);
create index staff_quotations_created_at_idx on public.staff_quotations (created_at desc);

alter table public.staff_quotations enable row level security;
create policy "staff_quotations: super_admin read" on public.staff_quotations
  for select to authenticated using (public.has_role('super_admin'));
create policy "staff_quotations: creator read" on public.staff_quotations
  for select to authenticated
  using (created_by = auth.uid() and public.is_staff() and public.has_permission('create_quotations'));
-- No insert/update/delete policies: only the server (service role) writes.
revoke insert, update, delete on public.staff_quotations from anon, authenticated;

create trigger audit_changes after insert or update or delete on public.staff_quotations
  for each row execute function public.audit_row_change('all');
