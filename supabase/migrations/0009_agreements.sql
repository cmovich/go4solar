-- 0009_agreements.sql — guarantees, agreement templates, signed agreements, signing codes.
-- Never edit this file after it has been pushed; add a new migration instead.

create type public.guarantee_status as enum ('invited', 'in_progress', 'signed', 'declined', 'expired');
create type public.agreement_type as enum ('consumer', 'guarantor', 'installer', 'vendor');
create type public.template_status as enum ('draft', 'approved');

-- ---------------------------------------------------------------------------
-- Guarantees: one row per invitation. The link token is never stored, only its keyed hash.
-- A resend replaces token_hash, so the old link stops working.
-- ---------------------------------------------------------------------------
create table public.guarantees (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null references public.applications (id) on delete cascade,
  name                  text not null,
  phone                 text not null,
  email                 text not null,
  relationship          text,
  token_hash            text not null unique,
  expires_at            timestamptz not null,
  status                public.guarantee_status not null default 'invited',
  steps                 jsonb not null default '{}'::jsonb,
  -- DOB, address, employment, income range (no raw NIN)
  details               jsonb not null default '{}'::jsonb,
  nin_last4             text,
  -- Keyed hash of the guarantor's NIN: compares identities (not the applicant, max active) without storing it
  nin_hash              text,
  biometric_consent_at  timestamptz,
  decline_reason        text,
  guarantor_profile_id  uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger guarantees_updated_at before update on public.guarantees
  for each row execute function public.set_updated_at();
create index guarantees_application_idx on public.guarantees (application_id, created_at desc);
create index guarantees_nin_hash_idx on public.guarantees (nin_hash);

-- ---------------------------------------------------------------------------
-- Agreement templates (versioned) and signed agreements
-- ---------------------------------------------------------------------------
create table public.agreement_templates (
  id              uuid primary key default gen_random_uuid(),
  type            public.agreement_type not null,
  version         integer not null,
  body_md         text not null,
  status          public.template_status not null default 'draft',
  approved_by     uuid references public.profiles (id) on delete set null,
  approved_at     timestamptz,
  effective_from  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (type, version)
);

create table public.agreements (
  id               uuid primary key default gen_random_uuid(),
  type             public.agreement_type not null,
  template_id      uuid not null references public.agreement_templates (id),
  version          integer not null,
  -- consumer: the profile id; guarantor: the guarantee id
  subject_id       uuid not null,
  application_id   uuid references public.applications (id) on delete cascade,
  signer_name      text not null,
  signer_title     text,
  signature_path   text not null,
  typed_name       text not null,
  otp_verified_at  timestamptz not null,
  ip               text,
  user_agent       text,
  signed_at        timestamptz not null default now(),
  pdf_path         text not null,
  -- SHA-256 of the final PDF file (tamper evidence) and of the signed content (printed on the audit page)
  pdf_sha256       text not null,
  content_sha256   text not null,
  created_at       timestamptz not null default now()
);
create index agreements_application_idx on public.agreements (application_id, type);

-- One-time codes that confirm a signature (consumer or guarantor). Hash only.
create table public.signature_otps (
  id            uuid primary key default gen_random_uuid(),
  subject_type  text not null check (subject_type in ('consumer', 'guarantor')),
  subject_id    uuid not null,
  phone_e164    text not null,
  code_hash     text not null,
  attempts      integer not null default 0,
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index signature_otps_subject_idx on public.signature_otps (subject_id, created_at desc);

insert into public.settings (key, value) values ('max_active_guarantees', '2') on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.guarantees           enable row level security;
alter table public.agreement_templates  enable row level security;
alter table public.agreements           enable row level security;
alter table public.signature_otps       enable row level security; -- service role only

create policy "guarantees: applicant read" on public.guarantees for select using (
  exists (select 1 from public.applications a where a.id = guarantees.application_id and a.consumer_id = auth.uid())
);
create policy "guarantees: staff read" on public.guarantees for select using (public.is_staff());

create policy "agreement_templates: staff read" on public.agreement_templates for select using (public.is_staff());
create policy "agreement_templates: super_admin write" on public.agreement_templates for all
  using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

create policy "agreements: signer read" on public.agreements for select using (
  subject_id = auth.uid()
  or exists (select 1 from public.applications a where a.id = agreements.application_id and a.consumer_id = auth.uid())
);
create policy "agreements: staff read" on public.agreements for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Version 1 templates (DRAFT until a super admin approves a version).
-- {{placeholders}} are filled from the stored quote snapshot and settings at signing time.
-- ---------------------------------------------------------------------------
insert into public.agreement_templates (type, version, body_md, status) values
('consumer', 1, $tpl$# Solar Payment Plan Agreement

**DRAFT — lawyer review required**

Reference: {{reference}} · Date: {{date}}

## 1. Parties
This agreement is between **Go4Solar Energy Limited**, Suite 40, Jayjay Shopping Complex ("Go4Solar"), and **{{customerName}}** ("the Customer"){{businessClause}}, of {{address}}.

## 2. The system
Go4Solar will supply and install: {{systemDescription}}. Serial numbers: to be recorded on the installation certificate and added to this agreement on commissioning.

## 3. Price and payment plan
- System price (total amount payable): **{{totalPayable}}**
- Deposit: **{{deposit}}** ({{depositPct}}), paid before installation
- Then **{{instalmentCount}} monthly payments** of **{{monthly}}**{{lastInstalmentNote}}
- Payment plan length: {{tenure}} months

**No interest is charged.** The total amount payable above is the full price of the system: there are no interest charges, finance charges or hidden fees. The only additional charge is the late fee in clause 7.

## 4. Ownership
Ownership of the system passes to the Customer when the final monthly payment has been made. Until then the system belongs to Go4Solar (or the financing partner named by Go4Solar).

## 5. Collateral and registration
Until the final payment, the system is collateral for this payment plan. Go4Solar may register its interest in the system on the National Collateral Registry and will remove the registration after the final payment.

## 6. Remote monitoring and remote lock
The system is monitored remotely. If a monthly payment is **14 days late**, Go4Solar may lock the system remotely. The system is unlocked promptly once the overdue amount is paid. The Customer may appeal once for **one extension of up to 30 days**, which Go4Solar may grant at its discretion.

## 7. Late payment fee
A late fee of **{{lateFeeDaily}} of the overdue amount per day** applies from the day after a payment is due, capped at **{{lateFeeCap}} of the overdue amount**.

## 8. Default and retrieval
If payments remain unpaid after the lock period and any extension, Go4Solar will give formal written notice of default. If the default is not remedied within the notice period, Go4Solar may retrieve the system.

## 9. Direct debit
The Customer authorises Go4Solar (and its payment partner) to collect each monthly payment from the bank account named in the direct-debit mandate on its due date.

## 10. Credit reporting
Go4Solar may report the payment record under this agreement, including late or missed payments, to licensed credit bureaus.

## 11. Warranty and maintenance
Equipment carries the manufacturers' warranties. Go4Solar handles warranty claims during the payment plan. The Customer will keep the system in good condition, not move or tamper with it, and allow access for maintenance and inspection.

## 12. Personal and biometric data
The Customer consents to Go4Solar and its verification partners processing their personal data, ID data and face images to verify identity, manage this payment plan and meet legal obligations, in line with the Nigeria Data Protection Act 2023. Details are in the Privacy Policy.

## 13. Governing law
This agreement is governed by the laws of the Federal Republic of Nigeria.

## 14. Electronic signature
The parties agree that this agreement is signed electronically and that the electronic signature, the one-time code sent to the Customer's phone and the audit record are valid evidence under the Evidence Act 2011.

Signed by: **{{signerName}}**{{signerTitleLine}}
$tpl$, 'draft'),
('guarantor', 1, $tpl$# Guarantee

**DRAFT — lawyer review required**

Reference: {{reference}} · Date: {{date}}

## 1. Parties
This guarantee is given by **{{guarantorName}}** ("the Guarantor") to **Go4Solar Energy Limited** ("Go4Solar") for the solar payment plan of **{{customerName}}** ("the Customer").

## 2. The payment plan guaranteed
Total amount payable {{totalPayable}}: deposit {{deposit}}, then {{instalmentCount}} monthly payments of {{monthly}} over {{tenure}} months. No interest is charged.

## 3. Guarantee
The Guarantor guarantees the Customer's obligations under the payment plan agreement, including the monthly payments, late fees and the cost of retrieving the system.

## 4. Liability if the Customer defaults
If the Customer fails to pay and the default is not remedied, the Guarantor will pay the amounts due on demand.

## 5. Notice before demand
Go4Solar will give the Guarantor written notice of the Customer's default before making any demand under this guarantee.

## 6. Personal and biometric data
The Guarantor consents to Go4Solar and its verification partners processing their personal data, ID data and face images to verify identity and manage this guarantee, in line with the Nigeria Data Protection Act 2023.

## 7. Governing law and electronic signature
This guarantee is governed by the laws of Nigeria and is signed electronically; the electronic signature, one-time code and audit record are valid evidence under the Evidence Act 2011.

Signed by: **{{guarantorName}}**
$tpl$, 'draft'),
('installer', 1, $tpl$# Installer Partner Agreement

**DRAFT — lawyer review required**

Placeholder: the installer partner agreement will be added before installer onboarding (Phase 2).
$tpl$, 'draft'),
('vendor', 1, $tpl$# Vendor Partner Agreement

**DRAFT — lawyer review required**

Placeholder: the vendor partner agreement will be added before vendor onboarding (Phase 2).
$tpl$, 'draft');
