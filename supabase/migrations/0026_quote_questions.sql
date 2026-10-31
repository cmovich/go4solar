-- Part E: the quote wizard questions (one per screen after the calculator).
-- Adds one table (roof_types), a `site` column on waitlist_consumers and quotes, and a `wiring`
-- setting. Nothing is dropped or renamed; no existing data changes.

-- 1. Roof types: picture cards in the wizard ("What type of roof do you have?"). Admin edits them
--    in /admin/roof-types; photos live in the public site-media bucket. Installation prices per
--    roof type and racks arrive with Part F. Seeded SAMPLE rows, without photos.
create table public.roof_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 2 and 80),
  -- plain words under the picture, e.g. "Wavy aluminium or zinc sheets"
  description text check (description is null or char_length(description) <= 200),
  photo       text,  -- path in the site-media bucket (800 × 600)
  needs_rack  boolean not null default true,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  sample      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.roof_types is
  'Roof types for the quote wizard (picture cards). needs_rack: panels need a mounting rack on this roof.';
create trigger roof_types_updated_at before update on public.roof_types
  for each row execute function public.set_updated_at();
create trigger audit_changes after insert or update or delete on public.roof_types
  for each row execute function public.audit_row_change('all');

alter table public.roof_types enable row level security;
create policy "roof_types: read active" on public.roof_types
  for select using (active or public.is_staff());
create policy "roof_types: content staff write" on public.roof_types
  for all to authenticated
  using (public.my_role() in ('super_admin', 'content'))
  with check (public.my_role() in ('super_admin', 'content'));

insert into public.roof_types (name, description, needs_rack, sort_order) values
  ('Long-span aluminium', 'Long wavy or ridged aluminium sheets', true, 10),
  ('Corrugated zinc', 'Wavy zinc or iron sheets', true, 20),
  ('Stone-coated tiles', 'Metal tiles with a stone finish', true, 30),
  ('Concrete or clay tiles', 'Heavy roof tiles', true, 40),
  ('Flat concrete roof', 'A flat concrete deck you can walk on', true, 50),
  ('Asbestos sheets', 'Old grey fibre sheets (we may advise against mounting)', true, 60);

-- 2. The customer's answers: { scope, existing, style, mounting, mountingOther, roofTypeId,
--    roofTypeName, rack, building, wire } (grid answers stay in the `grid` column from 0024).
alter table public.waitlist_consumers add column site jsonb;
alter table public.quotes add column site jsonb;

-- 3. Wire estimate when the customer does not know the length (admin-editable, audited via the
--    settings audit trigger). SAMPLE until confirmed.
insert into public.settings (key, value) values
  ('wiring', '{
    "metresPerStorey": 3,
    "horizontalMetres": 10,
    "dcMultiplier": 2,
    "slackShare": 0.15,
    "sample": true
  }'::jsonb)
on conflict (key) do nothing;
