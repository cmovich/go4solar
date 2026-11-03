import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'
import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
let session: SessionInfo = { user: null, role: null, aal: null }
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'localhost:3200' }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: async () => session }))
const invoiceForQuote = vi.fn(async (quoteId: string) => ({
  ok: true as const,
  id: 'inv-1',
  invoice: { number: 'G4S-INV-2026-0001', quoteId },
}))
vi.mock('@/lib/invoices/server', () => ({
  invoiceForQuote: (id: string) => invoiceForQuote(id),
}))
vi.mock('@/lib/pdf/InvoicePdf', () => ({
  renderInvoicePdf: async () => Buffer.from('%PDF-fake'),
}))

const { GET } = await import('./route')

const QUOTE = '44444444-4444-4444-8444-444444444444'
const call = (quoteId = QUOTE) =>
  GET(new Request(`http://x/api/app/invoices/${quoteId}`), {
    params: Promise.resolve({ quoteId }),
  })

beforeEach(() => {
  db = fakeSupabase()
  invoiceForQuote.mockClear()
  db.seed('quotes', { id: QUOTE, owner_id: 'u-amina' })
})

describe('GET /api/app/invoices/[quoteId]', () => {
  it('not signed in → 401', async () => {
    session = { user: null, role: null, aal: null }
    expect((await call()).status).toBe(401)
  })

  it("another customer's quote → 404, no invoice issued", async () => {
    session = { user: { id: 'u-moses', email: 'm@x.test' }, role: 'consumer', aal: 'aal1' }
    expect((await call()).status).toBe(404)
    expect(invoiceForQuote).not.toHaveBeenCalled()
  })

  it('the owner gets the PDF', async () => {
    session = { user: { id: 'u-amina', email: 'a@x.test' }, role: 'consumer', aal: 'aal1' }
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('G4S-INV-2026-0001')
    expect(invoiceForQuote).toHaveBeenCalledWith(QUOTE)
  })

  it('a malformed id → 404', async () => {
    session = { user: { id: 'u-amina', email: 'a@x.test' }, role: 'consumer', aal: 'aal1' }
    expect((await call('nope')).status).toBe(404)
  })
})
