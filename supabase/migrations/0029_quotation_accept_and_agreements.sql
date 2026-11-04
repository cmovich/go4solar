-- PR #28 review (Part I follow-up). Adds only; nothing dropped or renamed.
--
-- 1. "Your quotation" step: when the customer pressed "Accept and continue".
--    Live: on the quote (the numbered invoice is issued at that moment).
--    Prelaunch: on the waiting-list lead (no invoice number is used before launch).
alter table public.quotes add column if not exists accepted_at timestamptz;
alter table public.waitlist_consumers add column if not exists quotation_accepted_at timestamptz;

-- 2. Go4Solar's legal team approved the payment plan agreement (consumer v2) and the guarantee
--    (guarantor v1) — Semako, 4 Nov 2026. Approving a version removes the
--    "DRAFT — lawyer review required" line from the screen and from PDFs signed from now on.
--    PDFs already signed are stored files and do not change. The installer and vendor
--    templates stay drafts. The audit trigger on agreement_templates records this change.
update public.agreement_templates
set status = 'approved',
    approved_at = now(),
    effective_from = now()
where status = 'draft'
  and ((type = 'consumer' and version = 2) or (type = 'guarantor' and version = 1));
