-- One quotation can start only ONE live application.
--
-- On a slow connection the application wizard's "start application" ran twice at the same
-- moment and made two applications for one quote (21 Nov 2026: the SPEWA demo, plus 131 pairs in
-- test data). From now on the database refuses a second LIVE application for the same quote; the
-- app then uses the first one (ensureApplication in src/lib/applications/server.ts).
--
-- Live = draft, submitted, under_review, more_info, approved. Every other status (today only
-- 'declined'; any end status added later, such as cancelled or withdrawn) is ignored, so the same
-- quotation can start a new application after the earlier one ended without going ahead.
--
-- Only applications created from 24 Nov 2026 are checked, so the existing pairs (left exactly as
-- they are: the SPEWA demo file must not change) do not stop this index from being created.
--
-- Nothing is dropped, renamed or changed.

create unique index applications_one_live_per_quote
  on public.applications (quote_id)
  where quote_id is not null
    and status in ('draft', 'submitted', 'under_review', 'more_info', 'approved')
    and created_at >= timestamptz '2026-11-24 00:00:00+01';
