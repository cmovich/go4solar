-- Go4Solar's legal team approved the installer agreement (v1) and the vendor agreement (v1) —
-- Semako, 4 Nov 2026 (together with /terms, whose DRAFT bar is removed in code). Approving a
-- version removes the "DRAFT — lawyer review required" line from the screen and from PDFs signed
-- from now on; PDFs already signed are stored files and do not change. Changes data only; the
-- audit trigger on agreement_templates records it.
update public.agreement_templates
set status = 'approved',
    approved_at = now(),
    effective_from = now()
where status = 'draft'
  and ((type = 'installer' and version = 1) or (type = 'vendor' and version = 1));
