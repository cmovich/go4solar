-- Part I: invoices (PDF) and company details. Adds only; nothing dropped or renamed.
--
-- * settings.company: the company details printed on invoices (admin "Company details" page).
--   quote_validity_days already exists (0001) and is edited on the same page.
-- * invoices: one row per invoice issued, with the full snapshot the PDF is drawn from, so a
--   later price or company change never alters an old invoice.
-- * Invoice numbers come from database sequences: G4S-INV-YYYY-NNNN for real customers and
--   G4S-TEST-INV-YYYY-NNNN for test data, so test runs never leave gaps in the real numbers.

insert into public.settings (key, value) values (
  'company',
  jsonb_build_object(
    'name', 'Go4Solar Energy Limited',
    'address', 'Suite 40, Jayjay Shopping Complex, Kaduna',
    'phone', '08182112423',
    'email', 'contact@go4solar.app',
    'website', 'www.go4solar.app',
    'rcNumber', null
  )
) on conflict (key) do nothing;

create sequence if not exists public.invoice_number_seq;
create sequence if not exists public.invoice_test_number_seq;

-- G4S-INV-2026-0001 (at least four digits; grows past 9999 instead of cutting digits off).
create or replace function public.next_invoice_number(p_test boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  if p_test then
    n := nextval('public.invoice_test_number_seq');
  else
    n := nextval('public.invoice_number_seq');
  end if;
  return (case when p_test then 'G4S-TEST-INV-' else 'G4S-INV-' end)
    || to_char(now() at time zone 'Africa/Lagos', 'YYYY') || '-'
    || lpad(n::text, greatest(4, length(n::text)), '0');
end $$;

revoke all on function public.next_invoice_number(boolean) from public, anon, authenticated;
grant execute on function public.next_invoice_number(boolean) to service_role;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  -- Random short code for the printed link and QR code (/verify/<code>); not guessable.
  public_code text not null unique check (public_code ~ '^[a-z0-9]{10,16}$'),
  -- What the invoice is for: one plan at one deposit and length, priced once (see source_key).
  quote_id uuid references public.quotes(id) on delete set null,
  waitlist_id uuid references public.waitlist_consumers(id) on delete set null,
  consumer_id uuid references public.profiles(id) on delete set null,
  -- The same plan, deposit, length and price gets the same invoice back (no new number).
  source_key text not null unique,
  -- Everything printed: company, customer, lines, totals, notes, dates.
  data jsonb not null,
  total numeric(14,2) not null check (total >= 0),
  first_name text,
  issued_at timestamptz not null default now(),
  valid_until timestamptz not null,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create index invoices_quote_idx on public.invoices (quote_id);
create index invoices_waitlist_idx on public.invoices (waitlist_id);
create index invoices_consumer_idx on public.invoices (consumer_id);

alter table public.invoices enable row level security;
-- Customers read their own invoices; staff read all. Only the server (service role) writes.
create policy "invoices: own read" on public.invoices
  for select using (consumer_id = auth.uid());
create policy "invoices: staff read" on public.invoices
  for select using (public.is_staff());

create trigger audit_changes after insert or update or delete on public.invoices
  for each row execute function public.audit_row_change('all');
