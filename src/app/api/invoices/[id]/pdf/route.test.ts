import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signInvoiceLink } from '@/lib/invoices/link'

const INVOICE = '55555555-5555-4555-8555-555555555555'
vi.mock('@/lib/invoices/server', () => ({
  invoiceById: async (id: string) =>
    id === INVOICE ? { kind: 'invoice', number: 'G4S-INV-2026-0001' } : null,
}))
vi.mock('@/lib/pdf/InvoicePdf', () => ({ renderInvoicePdf: async () => Buffer.from('%PDF-1.3') }))

const { GET } = await import('./route')
const SECRET = 'local-test-only-id-hash-secret-0123456789'

const call = (id: string, exp: string, sig: string) =>
  GET(new Request(`http://x/api/invoices/${id}/pdf?exp=${exp}&sig=${sig}`), {
    params: Promise.resolve({ id }),
  })

beforeEach(() => {
  process.env.ID_HASH_SECRET = SECRET
})

describe('GET /api/invoices/[id]/pdf (signed link)', () => {
  it('a valid link: the PDF, opened in the browser, with a .pdf name', async () => {
    const { exp, sig } = signInvoiceLink(INVOICE, new Date(), SECRET)
    const res = await call(INVOICE, exp, sig)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe(
      'inline; filename="go4solar-invoice-G4S-INV-2026-0001.pdf"',
    )
  })

  it('an expired or tampered link: a page saying so (410), never a file', async () => {
    const old = signInvoiceLink(INVOICE, new Date(Date.now() - 60 * 60_000), SECRET)
    const res = await call(INVOICE, old.exp, old.sig)
    expect(res.status).toBe(410)
    expect(res.headers.get('content-type')).toContain('text/html')
    const { exp } = signInvoiceLink(INVOICE, new Date(), SECRET)
    expect((await call(INVOICE, exp, 'tampered')).status).toBe(410)
  })
})
