-- 0003_waitlist.sql — prelaunch waiting list (consumers + installers), export log, sample prices.
-- Never edit this file after it has been pushed; add a new migration instead.

-- ---------------------------------------------------------------------------
-- Consumers
-- ---------------------------------------------------------------------------
create type public.waitlist_status as enum ('incomplete', 'complete');
create type public.ready_when as enum ('now', '30_days', 'later');

create table public.waitlist_consumers (
  id                  uuid primary key default gen_random_uuid(),
  status              public.waitlist_status not null default 'incomplete',
  -- sha256 of the per-visitor cookie token; only the server (service role) reads or writes rows.
  visitor_token_hash  text not null,
  phone_e164          text not null,
  whatsapp_e164       text,
  email               text,
  first_name          text,
  surname             text,
  state               text,
  lga                 text,
  consent             boolean not null default false,
  consent_at          timestamptz,
  load_items          jsonb not null default '[]'::jsonb,
  load_totals         jsonb not null default '{}'::jsonb,
  chosen_plan         text check (chosen_plan in ('essential', 'comfort', 'independence')),
  deposit_share       numeric(4,3) check (deposit_share >= 0.2 and deposit_share <= 0.95),
  ready_when          public.ready_when,
  estimate            jsonb,
  duplicate_of        uuid references public.waitlist_consumers (id) on delete set null,
  entered_by          uuid references public.profiles (id) on delete set null,
  entry_channel       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.waitlist_consumers is 'Prelaunch sign-ups. Incomplete = left after giving a phone number. Cleared before launch.';

create index waitlist_consumers_phone_idx on public.waitlist_consumers (phone_e164);
create index waitlist_consumers_status_created_idx on public.waitlist_consumers (status, created_at desc);
create index waitlist_consumers_token_idx on public.waitlist_consumers (visitor_token_hash);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger waitlist_consumers_updated_at
  before update on public.waitlist_consumers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Installers
-- ---------------------------------------------------------------------------
create table public.waitlist_installers (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  business_name            text,
  phone_e164               text not null,
  whatsapp_e164            text,
  email                    text,
  states                   text[] not null default '{}',
  lgas                     text,
  years_in_business        integer check (years_in_business >= 0),
  installations_completed  integer check (installations_completed >= 0),
  cac_registered           boolean not null default false,
  consent                  boolean not null default false,
  consent_at               timestamptz,
  entered_by               uuid references public.profiles (id) on delete set null,
  created_at               timestamptz not null default now()
);

create index waitlist_installers_created_idx on public.waitlist_installers (created_at desc);

-- ---------------------------------------------------------------------------
-- Export log: "Clear waiting list" is only allowed after an export in the last 24 h.
-- ---------------------------------------------------------------------------
create table public.waitlist_exports (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('pdf', 'csv')),
  row_count    integer not null default 0,
  exported_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security. Visitors never touch these tables directly: every write goes through a
-- server action using the service role and the per-visitor token cookie.
-- ---------------------------------------------------------------------------
alter table public.waitlist_consumers  enable row level security;
alter table public.waitlist_installers enable row level security;
alter table public.waitlist_exports    enable row level security;

create policy "waitlist_consumers: staff read"
  on public.waitlist_consumers for select using (public.is_staff());
create policy "waitlist_consumers: super_admin delete"
  on public.waitlist_consumers for delete using (public.has_role('super_admin'));

create policy "waitlist_installers: staff read"
  on public.waitlist_installers for select using (public.is_staff());
create policy "waitlist_installers: super_admin delete"
  on public.waitlist_installers for delete using (public.has_role('super_admin'));

create policy "waitlist_exports: staff read"
  on public.waitlist_exports for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- SAMPLE prices and pricing settings so estimates work before real prices are loaded.
-- Replace both rows (sample → false) with the real price list before launch.
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('pricing', '{
    "sample": true,
    "pricingRateAnnual": 0.24,
    "marginByCategory": { "panels": 0.125, "battery": 0.125, "inverter": 0.125, "accessories": 0.125 }
  }'),
  ('price_list', '{
    "sample": true,
    "currency": "NGN",
    "panel": { "sku": "PNL-550", "name": "550 W solar panel", "watts": 550, "unitCost": 120000 },
    "batteryModule": { "sku": "BAT-2.5", "name": "2.5 kWh lithium battery module", "kwh": 2.5, "unitCost": 450000 },
    "inverters": [
      { "sku": "INV-1",   "name": "1 kVA hybrid inverter",    "kva": 1,   "unitCost": 180000 },
      { "sku": "INV-1.5", "name": "1.5 kVA hybrid inverter",  "kva": 1.5, "unitCost": 220000 },
      { "sku": "INV-2.5", "name": "2.5 kVA hybrid inverter",  "kva": 2.5, "unitCost": 350000 },
      { "sku": "INV-3.5", "name": "3.5 kVA hybrid inverter",  "kva": 3.5, "unitCost": 450000 },
      { "sku": "INV-5",   "name": "5 kVA hybrid inverter",    "kva": 5,   "unitCost": 650000 },
      { "sku": "INV-7.5", "name": "7.5 kVA hybrid inverter",  "kva": 7.5, "unitCost": 950000 },
      { "sku": "INV-10",  "name": "10 kVA hybrid inverter",   "kva": 10,  "unitCost": 1300000 },
      { "sku": "INV-15",  "name": "15 kVA hybrid inverter",   "kva": 15,  "unitCost": 1900000 },
      { "sku": "INV-20",  "name": "20 kVA hybrid inverter",   "kva": 20,  "unitCost": 2500000 }
    ],
    "accessoriesByKva": [
      { "maxKva": 1.5, "unitCost": 60000 },
      { "maxKva": 3.5, "unitCost": 100000 },
      { "maxKva": 7.5, "unitCost": 180000 },
      { "maxKva": 20,  "unitCost": 300000 }
    ],
    "installByState": { "FCT": 150000, "Kaduna": 150000, "Lagos": 200000, "Other": 200000 }
  }')
on conflict (key) do nothing;
