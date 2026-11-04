import 'server-only'

import { renderInvoicePdf } from '@/lib/pdf/InvoicePdf'

import type { InvoiceData } from './build'
import { signInvoiceLink } from './link'
import type { DocResult } from './server'

const MESSAGES = {
  not_found: ['We could not find this document.', 404],
  sample: ['Your exact price will be confirmed when we contact you.', 409],
  not_ready: ['This document is not available right now. Please try again in a moment.', 503],
  expired: ['This download link has expired. Go back and tap the link again.', 410],
  signin: ['Sign in to download your invoice.', 401],
} as const

export type DocProblem = keyof typeof MESSAGES

/**
 * A plain branded page (not a file), so a browser shows the message instead of saving a .txt
 * ("File wasn't available on site").
 */
export function problemPage(problem: DocProblem): Response {
  const [text, status] = MESSAGES[problem]
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Go4Solar</title></head><body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#F4F8F5;color:#0E3B22"><main style="max-width:32rem;margin:15vh auto;padding:24px;text-align:center"><p style="font-weight:700;font-size:20px">${text}</p><p><a href="/" style="color:#1B4E9B">Go to the Go4Solar home page</a></p></main></body></html>`
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** The PDF, opened in the browser (inline) with a proper .pdf name for saving. */
export async function pdfResponse(d: InvoiceData): Promise<Response> {
  const pdf = await renderInvoicePdf(d)
  const name = `go4solar-${d.kind}-${d.number}.pdf`
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${name}"`,
      'cache-control': 'private, no-store',
    },
  })
}

export async function docResponse(r: DocResult): Promise<Response> {
  return r.ok ? pdfResponse(r.invoice) : problemPage(r.reason)
}

/** A 30-minute link to an issued invoice that needs no sign-in cookie (download managers too). */
export function signedInvoiceUrl(id: string, now = new Date()): string {
  const { exp, sig } = signInvoiceLink(id, now, process.env.ID_HASH_SECRET ?? '')
  return `/api/invoices/${id}/pdf?exp=${exp}&sig=${sig}`
}
