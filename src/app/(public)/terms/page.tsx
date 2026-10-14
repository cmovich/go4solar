import type { Metadata } from 'next'
import Link from 'next/link'

import { H2, LegalPage } from '@/components/legal/LegalPage'
import { siteConfig } from '@/config/site'
import { lateFeeSettings } from '@/lib/agreements/server'

export const metadata: Metadata = { title: 'Terms of use' }

/** Website and app terms. The payment plan itself is governed by the signed agreement. DRAFT. */
export const revalidate = 3600

export default async function TermsPage() {
  const { lockAfterDays } = await lateFeeSettings()
  return (
    <LegalPage title="Terms of use" updated="12 October 2026">
      <p>
        These terms cover your use of the Go4Solar website and app run by {siteConfig.legalName},{' '}
        {siteConfig.address}. If you take a payment plan, the payment plan agreement you sign is
        what governs it; where the two differ, the signed agreement wins.
      </p>

      <H2>Quotes and estimates</H2>
      <p>
        The calculator and plan pages give estimates based on the appliances and hours you enter. A
        quote shows the total amount payable, the deposit, the monthly payment and the number of
        months, and is valid for the number of days shown on it. Prices can change after that
        because equipment is imported.
      </p>

      <H2>Payment plans</H2>
      <p>
        A payment plan needs an approved application, a signed agreement, a guarantor and a deposit
        of at least 20%. No interest is charged: the total amount payable on your quote is what you
        pay for the system. A late fee applies only when a monthly payment is late, at the rate
        written in your agreement. Until the final payment the system is collateral and can be
        locked remotely if a payment is {lockAfterDays} days overdue, as the agreement explains.
      </p>

      <H2>Your account</H2>
      <p>
        Keep your password and phone private. Give true information: false details can end an
        application or a plan. We may suspend accounts used for fraud or misuse.
      </p>

      <H2>Partners</H2>
      <p>
        Installers and vendors who join Go4Solar agree to the partner terms they sign. Jobs and
        payouts follow those terms.
      </p>

      <H2>Liability</H2>
      <p>
        We work to keep the site accurate and available but cannot promise it is always error-free.
        Nothing in these terms limits rights you have under Nigerian consumer protection law.
        Equipment warranties are explained in your agreement.
      </p>

      <H2>Your data</H2>
      <p>
        How we use your data is in our{' '}
        <Link href="/privacy" className="text-brand-blue underline">
          privacy policy
        </Link>
        .
      </p>

      <H2>Law and contact</H2>
      <p>
        These terms are governed by the laws of the Federal Republic of Nigeria. Questions:{' '}
        <a className="text-brand-blue underline" href={`mailto:${siteConfig.email}`}>
          {siteConfig.email}
        </a>
        , {siteConfig.phones.join(', ')}.
      </p>
    </LegalPage>
  )
}
