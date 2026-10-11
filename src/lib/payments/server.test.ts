import { beforeEach, describe, expect, it, vi } from 'vitest'

import { priceQuote } from '@/lib/pricing/price'
import { sampleQuoteInput } from '@/lib/pricing/pricing.fixture'
import { fakeSupabase } from '@/test/fakeSupabase'

import { toKobo } from './kobo'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))

const provider = {
  name: 'mock' as const,
  initDeposit: vi.fn(async (i: { reference: string }) => ({
    authorizationUrl: `https://pay.test/${i.reference}`,
  })),
  verify: vi.fn(),
  createMandate: vi.fn(async () => ({
    status: 'pending' as const,
    authorizationUrl: 'https://bank.test',
  })),
  verifyMandate: vi.fn(),
  chargeMandate: vi.fn(),
  refund: vi.fn(async () => ({ status: 'processed' as const })),
}
vi.mock('@/lib/providers/payments', () => ({ getPaymentsProvider: async () => provider }))
const sent: { channel: string; template: string }[] = []
vi.mock('@/lib/providers/messaging', () => ({
  getMessagingProvider: async () => ({
    send: async (m: { channel: string; template: string }) => (
      sent.push(m),
      { id: 'm', status: 'queued' }
    ),
  }),
}))

const pay = await import('./server')

const quote = priceQuote({ ...sampleQuoteInput, tenureMonths: 6 })
const ORIGIN = 'http://localhost:3000'

function seed({ guarantorSigned = true } = {}) {
  db = fakeSupabase({
    payments: [['reference'], ['provider_event_id']],
    loans: [['application_id']],
    repayment_schedule: [['loan_id', 'n']],
    mandates: [['init_reference']],
  })
  db.seed('applications', {
    id: 'app-1',
    consumer_id: 'u-1',
    status: 'draft',
    applicant_type: 'individual',
    quote_id: 'q-1',
    personal: { firstName: 'Ada', surname: 'Obi', email: 'ada@x.test', phone: '+2348031234567' },
    credit_flags: {},
    steps: { review: true, terms: true },
  })
  db.seed('quotes', { id: 'q-1', tenure: 6, result: quote })
  db.seed('agreements', {
    application_id: 'app-1',
    type: 'consumer',
    signed_at: '2026-10-11T09:00:00Z',
  })
  db.seed('guarantees', { application_id: 'app-1', status: guarantorSigned ? 'signed' : 'invited' })
  for (const kind of ['nin', 'bvn', 'liveness'])
    db.seed('kyc_checks', { subject_id: 'app-1', kind, status: 'passed', attempt: 1 })
}

function chargeSuccess(reference: string, amount: number, id = 'tx-1') {
  return {
    type: 'charge.success' as const,
    eventId: `charge.success:${id}`,
    reference,
    amountKobo: toKobo(amount),
    feesKobo: 200000,
    paidAt: '2026-10-11T10:00:00Z',
    channel: 'card',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sent.length = 0
  seed()
})

describe('deposit', () => {
  it('is blocked until the guarantor has signed (and lists what is missing)', async () => {
    seed({ guarantorSigned: false })
    const r = await pay.startDeposit('u-1', ORIGIN)
    expect(r).toEqual({
      ok: false,
      error: 'Not ready for the deposit yet.',
      missing: ['Your guarantor needs to sign'],
    })
    expect(db.rows('payments')).toHaveLength(0)
    expect(provider.initDeposit).not.toHaveBeenCalled()
  })

  it('charges the deposit from the stored quote snapshot', async () => {
    const r = await pay.startDeposit('u-1', ORIGIN)
    expect(r).toMatchObject({ ok: true, url: expect.stringContaining('https://pay.test/') })
    const [row] = db.rows('payments')
    expect(row).toMatchObject({
      kind: 'deposit',
      amount: quote.deposit,
      status: 'pending',
      application_id: 'app-1',
    })
    expect(provider.initDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: quote.deposit,
        email: 'ada@x.test',
        reference: row!.reference,
      }),
    )
  })

  it('a paid deposit submits the application: one loan, schedule summing to the balance, fee recorded', async () => {
    await pay.startDeposit('u-1', ORIGIN)
    const ref = String(db.rows('payments')[0]!.reference)
    expect(await pay.processPaymentEvent(chargeSuccess(ref, quote.deposit))).toBe('applied')

    expect(db.rows('applications')[0]).toMatchObject({ status: 'submitted' })
    expect(db.rows('loans')).toHaveLength(1)
    expect(db.rows('loans')[0]).toMatchObject({
      status: 'pending_approval',
      system_price: quote.systemPrice,
      cost_price: quote.costPrice,
      deposit: quote.deposit,
      balance: quote.balance,
      tenure: 6,
      auto_pay: false,
    })
    const schedule = db.rows('repayment_schedule')
    expect(schedule).toHaveLength(6)
    expect(schedule.reduce((s, r) => s + Number(r.amount), 0)).toBe(quote.balance)
    expect(db.rows('payments')[0]).toMatchObject({
      status: 'success',
      fee: 2000,
      provider_event_id: 'charge.success:tx-1',
    })
    expect(sent.map((m) => m.template)).toContain('deposit_received')
  })

  it('the same event twice (webhook + server verify) has one effect', async () => {
    await pay.startDeposit('u-1', ORIGIN)
    const ref = String(db.rows('payments')[0]!.reference)
    expect(await pay.processPaymentEvent(chargeSuccess(ref, quote.deposit))).toBe('applied')
    expect(await pay.processPaymentEvent(chargeSuccess(ref, quote.deposit))).toBe('duplicate')
    provider.verify.mockResolvedValueOnce({
      reference: ref,
      status: 'success',
      amount: quote.deposit,
      fee: 2000,
      paidAt: '2026-10-11T10:00:00Z',
      channel: 'card',
      providerId: 'tx-1',
    })
    expect(await pay.confirmCheckout(ref)).toBe('duplicate')
    expect(db.rows('payments')).toHaveLength(1)
    expect(db.rows('loans')).toHaveLength(1)
    expect(db.rows('repayment_schedule')).toHaveLength(6)
    expect(sent.filter((m) => m.template === 'deposit_received')).toHaveLength(2) // sms + email, once
  })

  it('the browser coming back is not enough: confirmCheckout asks the provider first', async () => {
    await pay.startDeposit('u-1', ORIGIN)
    const ref = String(db.rows('payments')[0]!.reference)
    provider.verify.mockResolvedValueOnce({
      reference: ref,
      status: 'pending',
      amount: 0,
      fee: 0,
      paidAt: null,
      channel: null,
      providerId: null,
    })
    expect(await pay.confirmCheckout(ref)).toBe('pending')
    expect(db.rows('applications')[0]).toMatchObject({ status: 'draft' })
  })

  it('a payment for the wrong amount is rejected', async () => {
    await pay.startDeposit('u-1', ORIGIN)
    const ref = String(db.rows('payments')[0]!.reference)
    expect(await pay.processPaymentEvent(chargeSuccess(ref, 1000))).toBe('rejected')
    expect(db.rows('applications')[0]).toMatchObject({ status: 'draft' })
    expect(db.rows('loans')).toHaveLength(0)
  })
})

describe('auto-pay', () => {
  it('skipping flags "no auto-pay" for the credit officer', async () => {
    await pay.skipAutoPay('u-1')
    expect(db.rows('applications')[0]!.credit_flags).toMatchObject({ noAutoPay: true })
  })

  it('an active mandate turns auto-pay on and clears the flag', async () => {
    await pay.startDeposit('u-1', ORIGIN)
    const ref = String(db.rows('payments')[0]!.reference)
    await pay.processPaymentEvent(chargeSuccess(ref, quote.deposit))
    const m = await pay.startMandate('u-1', ORIGIN)
    expect(m).toMatchObject({ ok: true, url: 'https://bank.test' })
    const mandateRef = String(db.rows('mandates')[0]!.init_reference)
    const r = await pay.processPaymentEvent({
      type: 'mandate.active',
      eventId: 'mandate.active:AUTH_1',
      reference: mandateRef,
      email: 'ada@x.test',
      authorizationCode: 'AUTH_1',
      bankName: 'GTBank',
      last4: '1234',
    })
    expect(r).toBe('applied')
    expect(db.rows('mandates')[0]).toMatchObject({
      status: 'active',
      provider_ref: 'AUTH_1',
      account_last4: '1234',
    })
    expect(db.rows('loans')[0]).toMatchObject({ auto_pay: true })
    expect(db.rows('applications')[0]!.credit_flags).toMatchObject({ noAutoPay: false })
  })

  it('a failed mandate keeps the flag on', async () => {
    await pay.startMandate('u-1', ORIGIN)
    const mandateRef = String(db.rows('mandates')[0]!.init_reference)
    await pay.processPaymentEvent({
      type: 'mandate.failed',
      eventId: 'mandate.failed:x',
      reference: mandateRef,
      email: null,
      reason: 'Bank not supported',
    })
    expect(db.rows('mandates')[0]).toMatchObject({
      status: 'failed',
      failure_reason: 'Bank not supported',
    })
    expect(db.rows('applications')[0]!.credit_flags).toMatchObject({ noAutoPay: true })
  })
})

describe('refund on decline', () => {
  it('refunds the whole deposit through the provider, cancels the loan and tells the customer', async () => {
    await pay.startDeposit('u-1', ORIGIN)
    const ref = String(db.rows('payments')[0]!.reference)
    await pay.processPaymentEvent(chargeSuccess(ref, quote.deposit))
    sent.length = 0

    const r = await pay.refundDeposit('app-1')
    expect(r).toEqual({ ok: true, status: 'processed' })
    expect(provider.refund).toHaveBeenCalledWith({ reference: ref, amount: quote.deposit })
    const refund = db.rows('payments').find((p) => p.kind === 'refund')!
    expect(refund).toMatchObject({
      amount: quote.deposit,
      status: 'success',
      refund_of: db.rows('payments')[0]!.id,
    })
    expect(db.rows('loans')[0]).toMatchObject({ status: 'cancelled' })
    expect(sent.map((m) => m.channel).sort()).toEqual(['email', 'sms', 'whatsapp'])
    expect(new Set(sent.map((m) => m.template))).toEqual(new Set(['deposit_refunded']))

    // Running it again does not refund twice.
    expect(await pay.refundDeposit('app-1')).toEqual({ ok: true, status: 'already_refunded' })
    expect(provider.refund).toHaveBeenCalledTimes(1)
  })

  it('nothing to refund when no deposit was paid', async () => {
    expect(await pay.refundDeposit('app-1')).toEqual({ ok: true, status: 'nothing_to_refund' })
    expect(provider.refund).not.toHaveBeenCalled()
  })
})
