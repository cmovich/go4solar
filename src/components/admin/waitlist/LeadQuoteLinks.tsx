'use client'

import Link from 'next/link'

/**
 * Admin → Waiting list (both tabs) and the Edit page: the person's quote, or "No quote yet".
 * "View quote" opens the quotation as the customer sees it; "Download PDF" the same as a PDF.
 */
export function LeadQuoteLinks({ id, hasQuote }: { id: string; hasQuote: boolean }) {
  if (!hasQuote) {
    return (
      <span className="text-muted-foreground whitespace-nowrap" data-testid="no-quote">
        No quote yet
      </span>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3" data-testid="lead-quote-links">
      <Link
        href={`/admin/waitlist/${id}/quote`}
        onClick={(e) => e.stopPropagation()}
        className="text-brand-blue inline-flex min-h-11 items-center font-semibold whitespace-nowrap underline"
        data-testid="view-quote"
      >
        View quote
      </Link>
      <a
        href={`/api/admin/waitlist/${id}/quote`}
        target="_blank"
        rel="noopener"
        onClick={(e) => e.stopPropagation()}
        className="text-brand-blue inline-flex min-h-11 items-center font-semibold whitespace-nowrap underline"
        data-testid="download-quote"
      >
        Download PDF
      </a>
    </span>
  )
}
