import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { QuotationView } from '@/components/invoices/QuotationView'
import { requireWaitlistViewer } from '@/lib/auth/roles'
import { quotationForLead } from '@/lib/invoices/server'

export const metadata: Metadata = { title: 'Quote' }
export const dynamic = 'force-dynamic'

/** Admin → Waiting list → "View quote": the person's quotation, as the customer sees it. */
export default async function LeadQuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireWaitlistViewer()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const doc = await quotationForLead(id)
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <p className="text-sm">
        <Link href="/admin/waitlist" className="text-brand-blue underline">
          ‹ Waiting list
        </Link>
        {' · '}
        <Link href={`/admin/waitlist/${id}/edit`} className="text-brand-blue underline">
          Edit profile
        </Link>
      </p>
      <h1 className="text-brand-dark mt-2 mb-4 text-2xl font-bold">Quote</h1>
      {doc.ok ? (
        <>
          <p className="mb-4">
            <a
              href={`/api/admin/waitlist/${id}/quote`}
              target="_blank"
              rel="noopener"
              className="text-brand-blue font-semibold underline"
              data-testid="download-quote"
            >
              Download PDF
            </a>
          </p>
          <QuotationView d={doc.invoice} />
        </>
      ) : (
        <p className="bg-brand-mist rounded-xl p-4" data-testid="no-quote">
          {doc.reason === 'sample'
            ? 'This quote was priced with SAMPLE prices, so there is no quotation document.'
            : 'No quote yet.'}
        </p>
      )}
    </main>
  )
}
