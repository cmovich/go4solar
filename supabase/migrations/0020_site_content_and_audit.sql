-- Testimonials, partners and a permanent, automatic audit log.
-- Adds tables, columns, a storage bucket, functions and triggers. The only thing removed is the
-- audit_log → profiles foreign key (see 1b): nothing else is dropped or renamed.

-- =============================================================================================
-- 1. Permanent audit log
-- =============================================================================================

-- 1a. Who did it, as they were at the time, and where the row came from.
alter table public.audit_log
  add column actor_email text,
  add column actor_role  text,
  add column source      text not null default 'app' check (source in ('app', 'trigger', 'auth'));

-- 1b. Audit rows outlive the accounts in them. With the foreign key a deleted (test) account
--     could not be removed, and audit rows can never be changed to clear it. The id stays, with
--     the email and role copied next to it.
alter table public.audit_log drop constraint audit_log_actor_id_fkey;

create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_action_idx on public.audit_log (action);

-- 1c. Staff roles (everyone else is a customer, guarantor, installer or vendor).
create or replace function public.is_staff_role(r text) returns boolean
language sql immutable as $$
  select r in ('super_admin', 'credit_officer', 'operations', 'collections', 'finance', 'content')
$$;

-- 1d. Who is making this change. A signed-in request carries the person in its verified JWT.
--     The server's service-role requests carry the signed-in staff member in the x-g4s-actor-id
--     header (set by src/lib/supabase/admin.ts); that header is trusted ONLY on service-role
--     requests, never from a browser.
create or replace function public.audit_actor()
returns table (id uuid, email text, role text)
language plpgsql stable security definer set search_path = public as $$
declare
  claims jsonb;
  hdrs   jsonb;
  raw    text;
  uid    uuid;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    hdrs   := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    claims := null; hdrs := null;
  end;
  raw := claims ->> 'sub';
  if (raw is null or raw = '') and coalesce(claims ->> 'role', '') = 'service_role' then
    raw := hdrs ->> 'x-g4s-actor-id';
  end if;
  if raw is null or raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  uid := raw::uuid;
  return query select p.id, p.email, p.role::text from public.profiles p where p.id = uid;
end $$;

-- 1e. Never copy secrets into the audit log: hashes, tokens, codes, passwords, signatures.
create or replace function public.audit_redact(j jsonb) returns jsonb
language sql immutable as $$
  select coalesce(
    jsonb_object_agg(
      k,
      case when k ~* '(hash|token|secret|otp|password|signature_png|selfie)' then '"[hidden]"'::jsonb
           else v end
    ),
    '{}'::jsonb)
  from jsonb_each(j) as e(k, v)
$$;

-- 1f. One row per insert / update / delete. Argument 'all' logs every change (tables only staff
--     write); 'staff' logs only changes made by a staff member (tables customers also write).
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  mode   text := coalesce(tg_argv[0], 'all');
  a      record;
  old_j  jsonb;
  new_j  jsonb;
  row_id text;
begin
  select * into a from public.audit_actor() limit 1;
  if mode = 'staff' and not coalesce(public.is_staff_role(a.role), false) then
    return null;
  end if;
  if tg_op <> 'INSERT' then old_j := public.audit_redact(to_jsonb(old)); end if;
  if tg_op <> 'DELETE' then new_j := public.audit_redact(to_jsonb(new)); end if;
  -- An update that changed nothing but the timestamp is not a change.
  if tg_op = 'UPDATE' and (old_j - 'updated_at') = (new_j - 'updated_at') then
    return null;
  end if;
  row_id := coalesce(
    new_j ->> 'id', old_j ->> 'id',
    new_j ->> 'key', old_j ->> 'key',
    new_j ->> 'category', old_j ->> 'category',
    new_j ->> 'tenure_months', old_j ->> 'tenure_months',
    new_j ->> 'month', old_j ->> 'month',
    (coalesce(new_j, old_j) ->> 'profile_id') || ':' || (coalesce(new_j, old_j) ->> 'permission'));
  insert into public.audit_log
    (actor_id, actor_email, actor_role, action, entity, entity_id, before, after, source)
  values
    (a.id, a.email, a.role, 'db.' || lower(tg_op), tg_table_name, row_id, old_j, new_j, 'trigger');
  return null;
end $$;

-- 1g. App-written rows get the actor's email and role filled in too.
create or replace function public.audit_log_fill_actor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.actor_id is not null and new.actor_email is null then
    select p.email, p.role::text into new.actor_email, new.actor_role
    from public.profiles p where p.id = new.actor_id;
  end if;
  return new;
end $$;
create trigger audit_log_fill_actor before insert on public.audit_log
  for each row execute function public.audit_log_fill_actor();

-- 1h. Append-only, for everyone including the service role: no update, delete or truncate.
create or replace function public.audit_log_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is permanent: % is not allowed', tg_op using errcode = '42501';
end $$;
create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_append_only();
revoke update, delete, truncate on public.audit_log from anon, authenticated, service_role;

-- 1i. Staff sign-ins, two-factor checks and sign-outs (Supabase sessions). Never blocks a login.
create or replace function public.audit_staff_session() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p record;
  act text;
begin
  select pr.id, pr.email, pr.role::text as role into p
  from public.profiles pr where pr.id = coalesce(new.user_id, old.user_id);
  if not coalesce(public.is_staff_role(p.role), false) then return null; end if;
  if tg_op = 'INSERT' then act := 'auth.sign_in';
  elsif tg_op = 'DELETE' then act := 'auth.sign_out';
  elsif new.aal is distinct from old.aal and new.aal::text = 'aal2' then act := 'auth.two_factor';
  else return null;
  end if;
  insert into public.audit_log
    (actor_id, actor_email, actor_role, action, entity, entity_id, before, after, source)
  values (p.id, p.email, p.role, act, 'auth.sessions', coalesce(new.id, old.id)::text, null,
          jsonb_build_object(
            'aal', coalesce(new.aal, old.aal)::text,
            'ip', host(coalesce(new.ip, old.ip)),
            'user_agent', left(coalesce(new.user_agent, old.user_agent), 200)),
          'auth');
  return null;
exception when others then
  return null;
end $$;
create trigger audit_staff_sessions after insert or update or delete on auth.sessions
  for each row execute function public.audit_staff_session();

-- Rows made by a test account are flagged, so they never reach the live home page.
create or replace function public.site_content_is_test() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.is_test := new.is_test
    or coalesce((select p.is_test from public.profiles p where p.id = auth.uid()), false);
  return new;
end $$;

-- =============================================================================================
-- 2. Testimonials (home page carousel)
-- =============================================================================================
create table public.testimonials (
  id                uuid primary key default gen_random_uuid(),
  client_name       text not null check (char_length(btrim(client_name)) between 1 and 40),
  client_city       text not null check (char_length(btrim(client_city)) between 1 and 60),
  client_quote      text not null check (char_length(btrim(client_quote)) between 1 and 220),
  system_size       text not null check (char_length(btrim(system_size)) between 1 and 60),
  installer_name    text not null check (char_length(btrim(installer_name)) between 1 and 80),
  installer_photo   text,  -- path in the site-media bucket (400 × 400)
  job_photo         text,  -- path in the site-media bucket (1200 × 800)
  consent_client    boolean not null default false,
  consent_installer boolean not null default false,
  published         boolean not null default false,
  sort_order        integer not null default 0,
  created_by        uuid default auth.uid(),
  -- Made by a test account (e2e): never shown on the live site.
  is_test           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint testimonials_publish_needs_consent
    check (not published or (consent_client and consent_installer))
);
create index testimonials_order_idx on public.testimonials (published, sort_order);
create trigger testimonials_updated_at before update on public.testimonials
  for each row execute function public.set_updated_at();
create trigger testimonials_is_test before insert on public.testimonials
  for each row execute function public.site_content_is_test();

alter table public.testimonials enable row level security;
create policy "testimonials: public reads published" on public.testimonials
  for select to anon, authenticated using (published and not is_test);
create policy "testimonials: staff read all" on public.testimonials
  for select to authenticated using (public.is_staff());
create policy "testimonials: content staff insert" on public.testimonials
  for insert to authenticated with check (public.my_role() in ('super_admin', 'content'));
create policy "testimonials: content staff update" on public.testimonials
  for update to authenticated using (public.my_role() in ('super_admin', 'content'))
  with check (public.my_role() in ('super_admin', 'content'));
create policy "testimonials: content staff delete" on public.testimonials
  for delete to authenticated using (public.my_role() in ('super_admin', 'content'));

-- =============================================================================================
-- 3. Partners (home page logo row)
-- =============================================================================================
create table public.partners (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  logo        text,  -- path in the site-media bucket (fitted to 400 × 200)
  website_url text check (website_url is null or website_url ~* '^https?://[^ ]+$'),
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_by  uuid default auth.uid(),
  is_test     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index partners_order_idx on public.partners (active, sort_order);
create trigger partners_updated_at before update on public.partners
  for each row execute function public.set_updated_at();
create trigger partners_is_test before insert on public.partners
  for each row execute function public.site_content_is_test();

alter table public.partners enable row level security;
create policy "partners: public reads active" on public.partners
  for select to anon, authenticated using (active and not is_test);
create policy "partners: staff read all" on public.partners
  for select to authenticated using (public.is_staff());
create policy "partners: content staff insert" on public.partners
  for insert to authenticated with check (public.my_role() in ('super_admin', 'content'));
create policy "partners: content staff update" on public.partners
  for update to authenticated using (public.my_role() in ('super_admin', 'content'))
  with check (public.my_role() in ('super_admin', 'content'));
create policy "partners: content staff delete" on public.partners
  for delete to authenticated using (public.my_role() in ('super_admin', 'content'));

insert into public.partners (name, sort_order) values
  ('SPEWA', 1), ('Trade Lenda', 2), ('Fine Grape System & Consult', 3), ('Felicity', 4);

-- =============================================================================================
-- 4. Public image bucket for the home page (testimonial photos, partner logos)
-- =============================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 10485760,
        array['image/webp', 'image/jpeg', 'image/png', 'image/svg+xml']);

create policy "site-media: content staff upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-media' and public.my_role() in ('super_admin', 'content'));
create policy "site-media: content staff replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-media' and public.my_role() in ('super_admin', 'content'));
create policy "site-media: content staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-media' and public.my_role() in ('super_admin', 'content'));

-- =============================================================================================
-- 5. Automatic audit on every table staff can change
-- =============================================================================================
-- Only staff write these: every change is logged.
do $$
declare t text;
begin
  foreach t in array array[
    'agreement_templates', 'appliance_library', 'category_margins', 'components', 'funders',
    'installation_costs', 'overheads', 'pricing_rates', 'settings', 'staff_permissions',
    'unit_costs', 'funder_draws', 'forecast_scenarios', 'waitlist_exports', 'testimonials',
    'partners']
  loop
    execute format(
      'create trigger audit_changes after insert or update or delete on public.%I '
      'for each row execute function public.audit_row_change(%L)', t, 'all');
  end loop;
end $$;

-- Customers write these too: only changes made by a staff member are logged.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'applications', 'kyc_checks', 'documents', 'jobs', 'loans', 'repayment_schedule',
    'payments', 'mandates', 'quotes', 'guarantees', 'agreements', 'waitlist_consumers',
    'waitlist_installers', 'cash_referrals', 'reminders']
  loop
    execute format(
      'create trigger audit_changes after insert or update or delete on public.%I '
      'for each row execute function public.audit_row_change(%L)', t, 'staff');
  end loop;
end $$;
