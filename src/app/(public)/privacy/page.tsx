import type { Metadata } from 'next'

import { H2, LegalPage } from '@/components/legal/LegalPage'
import { siteConfig } from '@/config/site'

export const metadata: Metadata = { title: 'Privacy policy' }

/** NDPA 2023 / GAID 2025 aligned privacy policy. DRAFT until the lawyer's review. */
export default function PrivacyPage() {
  const email = siteConfig.email
  return (
    <LegalPage title="Privacy policy" updated="12 October 2026">
      <p>
        {siteConfig.legalName} (&quot;Go4Solar&quot;, &quot;we&quot;), {siteConfig.address}, helps
        homes and small businesses in Nigeria buy solar systems on a payment plan. This policy
        explains what personal data we collect, why, how long we keep it and your rights under the
        Nigeria Data Protection Act 2023 (NDPA) and the General Application and Implementation
        Directive 2025 (GAID). We are the data controller.
      </p>

      <H2>What we collect</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Contact details:</strong> name, phone and WhatsApp number, email, state and LGA.
        </li>
        <li>
          <strong>Your energy use:</strong> the appliances you list and what you spend on power
          today.
        </li>
        <li>
          <strong>Application details:</strong> date of birth, address and map pin, work and income
          range, next of kin, guarantor&apos;s contact details, and for businesses the CAC details
          and bank statements you upload.
        </li>
        <li>
          <strong>Identity numbers:</strong> your NIN and BVN are checked with our verification
          partner. We keep only the last four digits and a protected (keyed) fingerprint used to
          stop duplicate applications. We never store the full numbers.
        </li>
        <li>
          <strong>Biometric data (sensitive):</strong> a short face check (liveness and face match)
          is done by our verification partner only after you tick the consent box. We keep the
          result, not your face images.
        </li>
        <li>
          <strong>ID images and documents:</strong> photos of your NIN slip, proof of address, CAC
          certificate and statements, kept in private storage.
        </li>
        <li>
          <strong>Agreement and signature:</strong> your drawn signature, typed name, the time, IP
          address, device and the phone code that confirmed it.
        </li>
        <li>
          <strong>Payments:</strong> amounts, dates and references from our payment partner, and for
          auto-pay the bank name and last four digits of the account. We never see your card number.
        </li>
        <li>
          <strong>Technical data:</strong> essential cookies (see below), IP address and device type
          for security.
        </li>
      </ul>

      <H2>Why we use it (and the legal basis)</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li>To size and price a system and send you quotes: your request (contract).</li>
        <li>
          To check who you are, prevent fraud and assess affordability: contract and legal
          obligation; the face check only with your explicit consent.
        </li>
        <li>
          To report your payment record to licensed credit bureaus: your consent, given when you
          sign.
        </li>
        <li>
          To run your payment plan, collect payments, send reminders and support you: contract.
        </li>
        <li>
          To meet legal, tax and regulatory duties and defend legal claims: legal obligation and
          legitimate interest.
        </li>
      </ul>
      <p>
        We do not sell your data and we do not send marketing messages without asking you first.
      </p>

      <H2>Who we share it with</H2>
      <p>
        Only with partners who help us deliver the service, under data-processing agreements:
        identity verification (QoreID / Dojah), payments and direct debit (Paystack), SMS, WhatsApp
        and email providers, our hosting and database providers, the installer and equipment
        supplier for your system, the licensed funder of your payment plan, and licensed credit
        bureaus. Some providers may process data outside Nigeria; we only use those with adequate
        protection as the NDPA requires.
      </p>

      <H2>How long we keep it</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li>ID images from identity checks that failed: deleted after 30 days.</li>
        <li>Waiting-list sign-ups that are cleared: deleted 7 days after clearing.</li>
        <li>
          Applications that do not go ahead: kept only as long as we need them to answer questions
          and meet legal duties.
        </li>
        <li>
          Agreements, payment records and identity check results for payment plans: for the plan and
          6 years after it ends (tax and legal records).
        </li>
        <li>Phone and email codes: hours, not days.</li>
      </ul>

      <H2>Your rights</H2>
      <p>
        You can ask to see the data we hold about you, correct it, delete it (where we do not have
        to keep it), restrict or object to how we use it, get a copy to move elsewhere, and withdraw
        consent at any time (this does not affect what we did before). You can also complain to the
        Nigeria Data Protection Commission (NDPC).
      </p>

      <H2>How to ask for access or deletion</H2>
      <p>
        Email{' '}
        <a className="text-brand-blue underline" href={`mailto:${email}`}>
          {email}
        </a>{' '}
        with the subject &quot;Data request&quot;, from the email or phone number you used with us.
        We reply within 30 days. We may ask you to confirm who you are first.
      </p>

      <H2>Security</H2>
      <p>
        Your data is encrypted in transit and at rest, identity files are in private storage opened
        only through short-lived links, access is limited by role, and staff sign in with two-factor
        authentication. Every staff action on money, approvals and prices is logged.
      </p>

      <H2>Cookies</H2>
      <p>
        We use essential cookies only: to keep you signed in (Supabase session cookies) and to
        remember your sign-up progress on this device (a random visitor cookie). Your appliance list
        is also kept on your own device. We use no advertising or tracking cookies.
      </p>

      <H2>Contact</H2>
      <p>
        {siteConfig.legalName}, {siteConfig.address}. Email{' '}
        <a className="text-brand-blue underline" href={`mailto:${email}`}>
          {email}
        </a>
        , phone {siteConfig.phones.join(', ')}.
      </p>
    </LegalPage>
  )
}
