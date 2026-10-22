-- Part W: delete single waiting-list entries (and all test entries) from /admin/waitlist.
-- Adds one staff permission and widens two delete policies. Nothing is dropped except two RLS
-- policies that are re-created wider; no column or table changes, no data changes.
--
-- Who may delete: a super admin, or any staff member given the new 'waitlist_delete' permission
-- on /admin/staff (there is no separate "admin" role; the permission is the admin right).
--
-- Audit: waitlist_consumers and waitlist_installers already carry the 0020 trigger
-- (after insert or update or delete, 'staff' mode), so every staff delete writes a db.delete row
-- with the full old row (secrets such as the visitor token hash shown as "[hidden]"). The app adds
-- its own 'waitlist.delete' row with the reason. audit_log stays append-only.

-- 1. The new permission.
alter table public.staff_permissions drop constraint staff_permissions_permission_check;
alter table public.staff_permissions add constraint staff_permissions_permission_check
  check (permission in ('assisted_entry', 'waitlist_delete'));
comment on table public.staff_permissions is
  'Permissions that can be given to any staff role. Known values: assisted_entry, waitlist_delete.';

-- 2. Delete policies: super admin, or staff with the permission.
drop policy "waitlist_consumers: super_admin delete" on public.waitlist_consumers;
create policy "waitlist_consumers: permitted staff delete"
  on public.waitlist_consumers for delete to authenticated
  using (public.has_role('super_admin') or (public.is_staff() and public.has_permission('waitlist_delete')));

drop policy "waitlist_installers: super_admin delete" on public.waitlist_installers;
create policy "waitlist_installers: permitted staff delete"
  on public.waitlist_installers for delete to authenticated
  using (public.has_role('super_admin') or (public.is_staff() and public.has_permission('waitlist_delete')));
