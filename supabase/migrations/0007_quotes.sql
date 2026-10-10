-- 0007_quotes.sql — quotes, cash-buyer referrals, reminders and phone one-time codes (Prompt 9).
-- Never edit this file after it has been pushed; add a new migration instead.

create type public.quote_status as enum ('draft', 'chosen', 'expired');

create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid references public.profiles (id) on delete set null,
  waitlist_id      uuid references public.waitlist_consumers (id) on delete set null,
  -- sha256 of the visitor cookie token; lets an anonymous visitor reach their own quote via server actions
  anon_token_hash  text not null,
  state            text not null,
  applicant_type   text check (applicant_type in ('individual', 'business')),
  load_items       jsonb not null,
  load_totals      jsonb not null,
  energy           jsonb,
  plan             text not null check (plan in ('essential', 'comfort', 'independence')),
  system_size      jsonb not null,
  tenure           integer check (tenure in (3, 6, 9, 12)),
  deposit_share    numeric(4,3) not null check (deposit_share >= 0.2 and deposit_share <= 1),
  -- QuoteResult incl. its snapshot (or { cash: true, cashPrice } for a pay-in-full referral)
  result           jsonb not null,
  valid_until      timestamptz not null,
  status           public.quote_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();
create index quotes_owner_idx on public.quotes (owner_id);
create index quotes_waitlist_idx on public.quotes (waitlist_id);

create table public.cash_referrals (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes (id) on delete cascade,
  vendor_id   uuid,
  created_at  timestamptz not null default now()
);

create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes (id) on delete cascade,
  channel     public.outbox_channel not null,
  "to"        text not null,
  due_at      timestamptz not null,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index reminders_due_idx on public.reminders (due_at) where sent_at is null;

-- One-time codes for phone verification: only the code's hash is stored.
create table public.phone_otps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  phone_e164   text not null,
  code_hash    text not null,
  attempts     integer not null default 0,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index phone_otps_user_idx on public.phone_otps (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS. Anonymous visitors never query these tables: every anonymous read/write goes through a
-- server action that checks the visitor cookie and uses the service role.
-- ---------------------------------------------------------------------------
alter table public.quotes          enable row level security;
alter table public.cash_referrals  enable row level security;
alter table public.reminders       enable row level security;
alter table public.phone_otps      enable row level security;

create policy "quotes: owner read" on public.quotes for select using (owner_id = auth.uid());
create policy "quotes: staff read" on public.quotes for select using (public.is_staff());
create policy "cash_referrals: staff read" on public.cash_referrals for select using (public.is_staff());
create policy "reminders: staff read" on public.reminders for select using (public.is_staff());
-- phone_otps: no policies (service role only).
