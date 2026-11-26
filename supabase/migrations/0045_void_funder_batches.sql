-- 0045: void a funder batch exported by mistake (Semako, 26 Nov 2026).
--
-- A voided batch is never shown to the funder (pages, downloads, decisions), never counts as
-- "Exported" for its people (they can be exported again) and frees its number: it is renamed
-- from TL-Batch-001 to TL-VOID-001 (the old number kept in voided_number), so the next real
-- batch is TL-Batch-001 again. Nothing is deleted; the audit trigger records the change.
-- Staff still see it in Admin → Exports, marked "Voided", with who, when and why.

alter table public.funder_batches
  add column voided_at     timestamptz,
  add column voided_by     uuid,
  add column void_reason   text check (char_length(void_reason) between 3 and 500),
  add column voided_number text,
  add constraint funder_batches_void_complete
    check ((voided_at is null) = (void_reason is null) and (voided_at is null) = (voided_number is null));

-- Numbers: TL-Batch-001 for live batches, TL-VOID-001 once voided.
-- (The 0041 check had no explicit name: drop whichever check is on "number".)
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.funder_batches'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%number%Batch%'
  loop
    execute format('alter table public.funder_batches drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.funder_batches add constraint funder_batches_number_check
  check (number ~ '^[A-Z]{2,5}-(Batch|VOID)-[0-9]{3,}$');

-- Funders never read a voided batch or its people (super admins and staff still do).
drop policy "funder_batches: super_admin or own funder" on public.funder_batches;
create policy "funder_batches: super_admin or own funder" on public.funder_batches
  for select to authenticated
  using (
    public.my_role()::text = 'super_admin'
    or (funder_id = public.my_funder_id() and voided_at is null)
  );
drop policy "funder_batch_items: super_admin or own funder" on public.funder_batch_items;
create policy "funder_batch_items: super_admin or own funder" on public.funder_batch_items
  for select to authenticated
  using (
    public.my_role()::text = 'super_admin'
    or exists (select 1 from public.funder_batches b
               where b.id = batch_id and b.funder_id = public.my_funder_id()
                 and b.voided_at is null)
  );
