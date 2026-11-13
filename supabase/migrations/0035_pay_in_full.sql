-- Pay in full (ready-made plans). Adds only; nothing dropped or renamed.
--
-- * payment_kind 'full_payment': one payment of the plan's pay-in-full price (plus any extra
--   delivery), instead of a deposit and monthly payments.
-- * loans.payment_type: 'plan' (deposit + monthly payments, as today) or 'full' (paid in full:
--   approved as soon as the money arrives, no credit review, no repayment schedule, nothing
--   drawn from a funder; marked completed once the system is installed). Every existing loan
--   is a 'plan'. Its tenure stays the 12 months the pay-in-full price is worked out from.

alter type public.payment_kind add value if not exists 'full_payment';

alter table public.loans
  add column payment_type text not null default 'plan'
  check (payment_type in ('plan', 'full'));

comment on column public.loans.payment_type is
  'plan: deposit + monthly payments. full: paid in full (no schedule, no funder draw).';
