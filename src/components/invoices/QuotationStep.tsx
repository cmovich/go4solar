'use client'

import { useEffect, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import type { InvoiceData } from '@/lib/invoices/build'

import { acceptLeadQuotation, quotationForLead } from '@/app/(public)/waitlist/quotation-actions'

import { InvoiceLink } from './InvoiceLink'
import { QuotationView } from './QuotationView'

/**
 * Prelaunch "Your quotation" (calculator flow after the deposit, builder after Submit): the full
 * quotation, Download PDF and "Accept and continue". While prices are SAMPLE it is skipped.
 */
export function QuotationStep({
  leadId,
  pdfHref,
  onAccepted,
}: {
  leadId: string
  /** The quotation PDF for this choice. */
  pdfHref: (q: InvoiceData) => string
  onAccepted: () => void
}) {
  const [q, setQ] = useState<InvoiceData | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()

  useEffect(() => {
    let live = true
    quotationForLead({ leadId }).then((r) => {
      if (!live) return
      if (r.ok) setQ(r.quotation)
      else if (r.reason === 'sample') onAccepted()
      else setFailed(true)
    })
    return () => {
      live = false
    }
    // Load once for this lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  const accept = () =>
    start(async () => {
      await acceptLeadQuotation({ leadId })
      onAccepted()
    })

  return (
    <div className="space-y-5" data-testid="quotation-step">
      <h1 className="text-brand-dark text-2xl font-bold tracking-tight">Your quotation</h1>
      {q ? (
        <>
          <p className="text-muted-foreground text-sm">
            Check everything below, then accept to continue.
          </p>
          <QuotationView d={q} />
          <InvoiceLink href={pdfHref(q)} testId="quotation-pdf" />
        </>
      ) : failed ? (
        <p className="bg-brand-mist rounded-xl p-4 text-sm">
          We could not show the quotation just now. You can still continue; we will send it to you.
        </p>
      ) : (
        <div className="bg-brand-mist h-64 animate-pulse rounded-2xl" aria-busy="true" />
      )}
      <Button
        type="button"
        className="h-12 w-full text-base sm:w-auto sm:px-10"
        disabled={pending || (!q && !failed)}
        onClick={accept}
        data-testid="accept-quotation"
      >
        {pending ? 'Accepting…' : 'Accept and continue'}
      </Button>
    </div>
  )
}
