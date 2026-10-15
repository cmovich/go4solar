import { createHmac } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { priceQuote } from '@/lib/pricing/price'
import { sampleQuoteInput } from '@/lib/pricing/pricing.fixture'
import { fakeSupabase } from '@/test/fakeSupabase'

const SECRET = 'sk_test_webhook_unit'
process.env.PAYMENTS_PROVIDER = 'paystack'
process.env.PAYSTACK_SECRET_KEY = SECRET

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
vi.mock('@/lib/providers/messaging', () => ({
  getMessagingProvider: async () => ({ send: async () => ({ id: 'm', status: 'queued' }) }),
}))

const { POST } = await import('./route')

const quote = priceQuote({ ...sampleQuoteInput, tenureMonths: 3 })
const REF = 'G4S-DEP-TEST01'

function post(body: string, signature: string | null) {
  return POST(
    new Request('http://localhost/api/webhooks/paystack', {
      method: 'POST',
      body,
      headers: signature ? { 'x-paystack-signature': signature } : {},
    }),
  )
}
const sign = (body: string) => createHmac('sha512', SECRET).update(body).digest('hex')

const event = JSON.stringify({
  event: 'charge.success',
  data: {
    id: 4099,
    reference: REF,
    amount: Math.round(quote.deposit * 100),
    fees: 200000,
    status: 'success',
    paid_at: '2026-10-11T10:00:00Z',
    channel: 'card',
  },
})

beforeEach(() => {
  db = fakeSupabase({
    payments: [['reference'], ['provider_event_id']],
    loans: [['application_id']],
    repayment_schedule: [['loan_id', 'n']],
  })
  db.seed('applications', {
    id: 'app-1',
    consumer_id: 'u-1',
    status: 'draft',
    applicant_type: 'individual',
    quote_id: 'q-1',
    personal: { email: 'ada@x.test' },
    credit_flags: {},
  })
  db.seed('quotes', { id: 'q-1', tenure: 3, result: quote })
  db.seed('payments', {
    provider: 'paystack',
    reference: REF,
    kind: 'deposit',
    consumer_id: 'u-1',
    application_id: 'app-1',
    amount: quote.deposit,
    fee: 0,
    status: 'pending',
  })
})

describe('POST /api/webhooks/paystack', () => {
  it('rejects a bad or missing signature with 401 and changes nothing', async () => {
    expect((await post(event, 'not-the-signature')).status).toBe(401)
    expect((await post(event, null)).status).toBe(401)
    expect(db.rows('payments')[0]).toMatchObject({ status: 'pending' })
  })

  it('the same event posted twice → one payment, one loan, one schedule', async () => {
    const first = await post(event, sign(event))
    const second = await post(event, sign(event))
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ received: true, outcome: 'duplicate' })

    expect(db.rows('payments')).toHaveLength(1)
    expect(db.rows('payments')[0]).toMatchObject({
      status: 'success',
      provider_event_id: 'charge.success:4099',
      fee: 2000,
    })
    expect(db.rows('loans')).toHaveLength(1)
    expect(db.rows('repayment_schedule')).toHaveLength(3)
    expect(db.rows('applications')[0]).toMatchObject({ status: 'submitted' })
  })

  it('unknown events are acknowledged and ignored', async () => {
    const body = JSON.stringify({ event: 'transfer.success', data: {} })
    const r = await post(body, sign(body))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ received: true, outcome: 'ignored' })
  })
})
