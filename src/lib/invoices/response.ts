import 'server-only'

import { renderInvoicePdf } from '@/lib/pdf/InvoicePdf'

import type { IssueResult } from './server'

const MESSAGES = {
  not_found: ['Not found', 404],
  sample: ['Your exact price will be confirmed when we contact you.', 409],
  not_ready: ['Invoices are not available right now. Please try again later.', 503],
} as const

/** An issued invoice as a PDF download, or a plain message. */
export async function invoiceResponse(r: IssueResult): Promise<Response> {
  if (!r.ok) {
    const [text, status] = MESSAGES[r.reason]
    return new Response(text, { status })
  }
  const pdf = await renderInvoicePdf(r.invoice)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="go4solar-invoice-${r.invoice.number}.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
