-- Let super admin and Content staff delete pictures from the site-media bucket.
-- Supabase Storage only deletes files the caller is allowed to see, so staff need a read policy
-- too. Scope: this bucket only, these two roles only. The public keeps viewing through the
-- bucket's public addresses; visitors and customers still cannot upload, list or delete.
create policy "site-media: content staff see files" on storage.objects
  for select to authenticated
  using (bucket_id = 'site-media' and public.my_role() in ('super_admin', 'content'));
