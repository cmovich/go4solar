import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { InvoiceLink } from '@/components/invoices/InvoiceLink'
import { QuotationView } from '@/components/invoices/QuotationView'
import { SampleQuotation } from '@/components/quotations/SampleQuotation'
import { ShareQuotation } from '@/components/quotations/ShareQuotation'
import { requireStaffWithMfa } from '@/lib/auth/roles'
import { storedBuild } from '@/lib/build/stored'
import { quotationForStaff } from '@/lib/invoices/server'
import { quoteReference } from '@/lib/quotes/quote'
import { originFor } from '@/lib/site/origin'
import { quotationStatus, shareHref, shareMessage, STATUS_LABELS } from '@/lib/staffQuotes/rules'
import { mayCreateQuotations, staffQuotationForAdmin } from '@/lib/staffQuotes/server'

export const metadata: Metadata = { title: 'Quotation' }
export const dynamic = 'force-dynamic'

/** One staff quotation: as the customer sees it, with Download PDF, Share on WhatsApp and the link. */
export default async function StaffQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffWithMfa()
  if (!(await mayCreateQuotations(session))) redirect('/admin')
  const { id } = await params
  const row = await staffQuotationForAdmin(session, id)
  if (!row) notFound()
  const reference = quoteReference(row.id)
  const link = `${originFor(await headers())}/q/${row.public_code}`
  const doc = await quotationForStaff(row)
  const b = storedBuild(row.builder)
  const message = shareMessage({
    customerName: row.customer_name,
    reference,
    total: Number(row.total),
    deposit: b?.deposit ?? 0,
    monthly: Number(row.monthly),
    months: row.tenure,
    sample: row.sample || !doc.ok,
    link,
  })
  const status = quotationStatus(row)
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <Link href="/admin/quotations" className="text-brand-blue text-sm underline">
        ‹ Quotations
      </Link>
      <h1 className="text-brand-dark text-3xl font-bold">Quotation {reference}</h1>
      <p className="text-sm" data-testid="quotation-status">
        Status: <strong>{STATUS_LABELS[status]}</strong>
        {row.customer_name ? ` · ${row.customer_name}` : ''}
        {row.customer_phone ? ` · ${row.customer_phone}` : ''}
      </p>
      <ShareQuotation
        id={row.id}
        whatsappHref={shareHref(row.customer_phone, message)}
        link={link}
      />
      <p className="text-muted-foreground text-xs break-all">
        Customer link:{' '}
        <a
          href={link}
          className="text-brand-blue underline"
          target="_blank"
          rel="noopener"
          data-testid="customer-link"
        >
          {link}
        </a>
      </p>
      {doc.ok ? (
        <>
          <QuotationView d={doc.invoice} />
          <InvoiceLink href={`/q/${row.public_code}/pdf`} testId="quotation-pdf" />
        </>
      ) : (
        <SampleQuotation builder={row.builder} reference={reference} />
      )}
    </main>
  )
}
