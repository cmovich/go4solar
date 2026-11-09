-- Sales role: installers and marketers who only make quotations. Adds only; one RLS policy is
-- re-created wider (staff_quotations creator read) and one helper re-defined with one more role.
--
-- * New app_role value 'sales'. It is NOT added to public.is_staff(), so a sales account gets no
--   staff read access to any table (waiting list, outbox, applications, prices, customers…).
-- * staff_quotations: a sales account reads the quotations it created (as staff with the
--   create_quotations permission already do). Writes stay server-only.
-- * public.is_staff_role(): used only by the audit log (who made a change, staff sign-ins), so a
--   sales account's sign-ins and its own changes are recorded like any staff member's.
--
-- The new enum value is compared as text below: Postgres does not allow using a value added in
-- the same transaction as an enum.

alter type public.app_role add value if not exists 'sales';

drop policy "staff_quotations: creator read" on public.staff_quotations;
create policy "staff_quotations: creator read" on public.staff_quotations
  for select to authenticated
  using (
    created_by = auth.uid()
    and (
      public.my_role()::text = 'sales'
      or (public.is_staff() and public.has_permission('create_quotations'))
    )
  );

create or replace function public.is_staff_role(r text) returns boolean
language sql immutable as $$
  select r in ('super_admin', 'credit_officer', 'operations', 'collections', 'finance', 'content', 'sales')
$$;
