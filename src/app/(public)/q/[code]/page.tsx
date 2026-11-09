import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { BrandLogo } from '@/components/brand/BrandLogo'
import { InvoiceLink } from '@/components/invoices/InvoiceLink'
import { QuotationView } from '@/components/invoices/QuotationView'
import { AcceptSharedQuotation } from '@/components/quotations/AcceptSharedQuotation'
import { SampleQuotation } from '@/components/quotations/SampleQuotation'
import { siteConfig } from '@/config/site'
import { quotationForStaff } from '@/lib/invoices/server'
import { quoteReference } from '@/lib/quotes/quote'
import { quotationStatus } from '@/lib/staffQuotes/rules'
import { acceptedNext, staffQuotationByCode } from '@/lib/staffQuotes/server'

export const metadata: Metadata = { title: 'Your quotation', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A quotation Go4Solar staff made and shared (link from WhatsApp). Both modes. "Accept and apply"
 * starts the customer's own sign-up from it; no account is needed to look at it.
 */
export default async function SharedQuotationPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const row = await staffQuotationByCode(code)
  const status = row ? quotationStatus(row) : null
  if (row && status === 'accepted') {
    const next = await acceptedNext(row)
    if (next) redirect(next)
  }
  const doc = row ? await quotationForStaff(row) : null

  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <BrandLogo onDark priority className="h-12 w-auto" />
          </Link>
          <span className="text-brand-gold text-sm font-semibold">Your quotation</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        <h1 className="text-brand-dark text-2xl font-bold tracking-tight">Your quotation</h1>
        {!row ? (
          <p className="bg-brand-mist rounded-xl p-4 text-sm" data-testid="quotation-missing">
            This quotation could not be found. Please check the link, or ask us for a new one.
          </p>
        ) : (
          <>
            {status === 'expired' && (
              <p
                className="rounded-xl bg-amber-100 p-4 text-sm text-amber-900"
                data-testid="quotation-expired"
              >
                This quotation has expired. Ask us for a new one.
              </p>
            )}
            {status === 'accepted' && (
              <p className="bg-brand-mist rounded-xl p-4 text-sm" data-testid="quotation-accepted">
                This quotation has been accepted. We will be in touch.
              </p>
            )}
            {doc?.ok ? (
              <>
                <QuotationView d={doc.invoice} />
                <InvoiceLink href={`/q/${row.public_code}/pdf`} testId="quotation-pdf" />
              </>
            ) : (
              <SampleQuotation builder={row.builder} reference={quoteReference(row.id)} />
            )}
            {(status === 'created' || status === 'shared') && (
              <>
                <p className="text-muted-foreground text-sm">
                  To go ahead, accept the quotation and give your details. We then set up your
                  payment plan with you step by step.
                </p>
                <AcceptSharedQuotation
                  code={row.public_code}
                  name={row.customer_name}
                  phone={row.customer_phone}
                />
              </>
            )}
          </>
        )}
      </main>
    </>
  )
}
