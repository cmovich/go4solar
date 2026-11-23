-- One quotation can start only ONE live application.
--
-- On a slow connection the application wizard's "start application" ran twice at the same
-- moment and made two applications for one quote (21 Nov 2026: the SPEWA demo, plus 131 pairs in
-- test data). From now on the database refuses a second live (not declined) application for the
-- same quote; the app then uses the first one (ensureApplication in src/lib/applications/server.ts).
--
-- Only applications created after the cut-off are checked, so the existing pairs (left exactly as
-- they are: the demo file must not change) do not stop this index from being created. A declined
-- application does not count, so a customer can apply again after a decline.
--
-- Nothing is dropped, renamed or changed.

create unique index applications_one_live_per_quote
  on public.applications (quote_id)
  where quote_id is not null
    and status <> 'declined'
    and created_at >= timestamptz '2026-11-24 00:00:00+01';
