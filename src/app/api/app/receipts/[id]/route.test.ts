import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'
import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
let session: SessionInfo = { user: null, role: null, aal: null }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: async () => session }))
const renderReceiptPdf = vi.fn(async (r: unknown) =>
  r ? Buffer.from('%PDF-fake') : Buffer.alloc(0),
)
vi.mock('@/lib/pdf/ReceiptPdf', () => ({ renderReceiptPdf: (r: unknown) => renderReceiptPdf(r) }))

const { GET } = await import('./route')

const PAY = '33333333-3333-4333-8333-333333333333'
const QUOTE = '44444444-4444-4444-8444-444444444444'
const call = (id = PAY) =>
  GET(new Request(`http://x/api/app/receipts/${id}`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  db = fakeSupabase()
  renderReceiptPdf.mockClear()
  db.seed('profiles', { id: 'u-love', full_name: 'Love Lounge' })
  db.seed('applications', { id: 'app-1', consumer_id: 'u-love', quote_id: QUOTE })
  db.seed('quotes', { id: QUOTE, result: { balance: 1_000_000 } })
  db.seed('loans', { id: 'loan-1', application_id: 'app-1' })
  db.seed('repayment_schedule', { id: 's1', loan_id: 'loan-1', n: 1 })
  db.seed('repayment_schedule', { id: 's2', loan_id: 'loan-1', n: 2 })
  db.seed('payments', {
    id: PAY,
    reference: 'G4S-PAY-1',
    kind: 'instalment',
    consumer_id: 'u-love',
    application_id: 'app-1',
    loan_id: 'loan-1',
    schedule_id: 's1',
    amount: 100000,
    status: 'success',
    channel: 'card',
    paid_at: '2026-12-04T09:00:00Z',
  })
})

describe('GET /api/app/receipts/[id]', () => {
  it('not signed in → 401', async () => {
    expect((await call()).status).toBe(401)
  })

  it("another customer's payment → 404 (nothing rendered)", async () => {
    session = { user: { id: 'u-moses', email: 'm@x.test' }, role: 'consumer', aal: 'aal1' }
    expect((await call()).status).toBe(404)
    expect(renderReceiptPdf).not.toHaveBeenCalled()
  })

  it('the owner gets a PDF with the right figures', async () => {
    session = { user: { id: 'u-love', email: 'l@x.test' }, role: 'consumer', aal: 'aal1' }
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(renderReceiptPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptNo: 'G4S-PAY-1',
        customerName: 'Love Lounge',
        label: 'Payment 1 of 2',
        amount: 100000,
        amountLeft: 900000,
      }),
    )
  })
})
