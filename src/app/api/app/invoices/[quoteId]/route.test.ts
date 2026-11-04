import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'
import { verifyInvoiceLink } from '@/lib/invoices/link'
import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
let session: SessionInfo = { user: null, role: null, aal: null }
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'localhost:3200' }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: async () => session }))
const INVOICE = '55555555-5555-4555-8555-555555555555'
const ensureInvoiceForQuote = vi.fn(async (quoteId: string) => ({
  quoteId,
  ok: true as const,
  id: INVOICE,
  invoice: { number: 'G4S-INV-2026-0001' },
}))
vi.mock('@/lib/invoices/server', () => ({
  ensureInvoiceForQuote: (id: string) => ensureInvoiceForQuote(id),
}))
vi.mock('@/lib/pdf/InvoicePdf', () => ({ renderInvoicePdf: async () => Buffer.from('%PDF') }))

const { GET } = await import('./route')

const QUOTE = '44444444-4444-4444-8444-444444444444'
const call = (quoteId = QUOTE) =>
  GET(new Request(`http://x/api/app/invoices/${quoteId}`), {
    params: Promise.resolve({ quoteId }),
  })

beforeEach(() => {
  db = fakeSupabase()
  ensureInvoiceForQuote.mockClear()
  process.env.ID_HASH_SECRET = 'local-test-only-id-hash-secret-0123456789'
  db.seed('quotes', { id: QUOTE, owner_id: 'u-love' })
})

describe('GET /api/app/invoices/[quoteId] (My account "Invoice (PDF)")', () => {
  it('not signed in → 401 page (not a file), nothing issued', async () => {
    session = { user: null, role: null, aal: null }
    const res = await call()
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(ensureInvoiceForQuote).not.toHaveBeenCalled()
  })

  it("another customer's quote → 404, no invoice issued", async () => {
    session = { user: { id: 'u-moses', email: 'm@x.test' }, role: 'consumer', aal: 'aal1' }
    expect((await call()).status).toBe(404)
    expect(ensureInvoiceForQuote).not.toHaveBeenCalled()
  })

  it('the owner is sent to a signed link to the PDF (opens without the cookie)', async () => {
    session = { user: { id: 'u-love', email: 'l@x.test' }, role: 'consumer', aal: 'aal1' }
    const res = await call()
    expect(res.status).toBe(303)
    const to = new URL(res.headers.get('location')!)
    expect(to.pathname).toBe(`/api/invoices/${INVOICE}/pdf`)
    expect(
      verifyInvoiceLink(
        INVOICE,
        to.searchParams.get('exp')!,
        to.searchParams.get('sig')!,
        new Date(),
        process.env.ID_HASH_SECRET!,
      ),
    ).toBe(true)
    expect(ensureInvoiceForQuote).toHaveBeenCalledWith(QUOTE)
  })

  it('a malformed id → 404', async () => {
    session = { user: { id: 'u-love', email: 'l@x.test' }, role: 'consumer', aal: 'aal1' }
    expect((await call('nope')).status).toBe(404)
  })
})
