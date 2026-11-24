-- Sales may READ the waiting list (Semako, 24 Nov 2026): Admin → Waiting list, Complete and
-- Incomplete tabs, open Edit and tick consent / "Details confirmed by phone" / "Agreed to the quote
-- figures" (as before, through the server).
--
-- Read only: Sales get no insert, update or delete on waiting-list rows (the delete policy stays
-- super admin or staff with the waitlist_delete permission), and the app hides delete / clear and
-- never lets Sales queue or export. Installer sign-ups (waitlist_installers) stay staff only.
--
-- Nothing is dropped or changed.

create policy "waitlist_consumers: sales read" on public.waitlist_consumers
  for select to authenticated
  using (public.my_role()::text = 'sales');
