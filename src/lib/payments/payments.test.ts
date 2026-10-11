import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type { CheckSummary, KycKind } from '@/lib/applications/rules'
import { priceQuote } from '@/lib/pricing/price'
import { sampleQuoteInput as pricingInput } from '@/lib/pricing/pricing.fixture'

import { depositReadiness } from './readiness'
import { buildSchedule } from './schedule'
import { fromKobo, toKobo } from './kobo'
import { paystackSignatureValid } from './signature'

describe('kobo', () => {
  it('naira → kobo is an exact whole number (Paystack takes kobo)', () => {
    expect(toKobo(308478)).toBe(30847800)
    expect(toKobo(1234.56)).toBe(123456)
    expect(toKobo(0.1 + 0.2)).toBe(30)
    expect(Number.isInteger(toKobo(102825.99))).toBe(true)
  })
  it('kobo → naira', () => {
    expect(fromKobo(30847800)).toBe(308478)
    expect(fromKobo(7550)).toBe(75.5)
  })
  it('refuses negative or non-finite amounts', () => {
    expect(() => toKobo(-1)).toThrow()
    expect(() => toKobo(Number.NaN)).toThrow()
  })
})

describe('buildSchedule', () => {
  const quote = priceQuote(pricingInput)

  it('one row per instalment, numbered from 1, summing exactly to the balance', () => {
    const rows = buildSchedule(quote.instalments, new Date('2026-10-11T09:00:00Z'))
    expect(rows).toHaveLength(quote.instalments.length)
    expect(rows.map((r) => r.n)).toEqual(quote.instalments.map((_, i) => i + 1))
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(quote.balance)
  })

  it('every tenure sums to its balance', () => {
    for (const tenureMonths of [3, 6, 9, 12] as const) {
      const q = priceQuote({ ...pricingInput, tenureMonths })
      const rows = buildSchedule(q.instalments, new Date('2026-10-11T09:00:00Z'))
      expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(q.balance)
    }
  })

  it('due one month apart from the start (Lagos dates), clamped to short months', () => {
    const rows = buildSchedule([100, 100, 100], new Date('2026-01-31T09:00:00Z'))
    expect(rows.map((r) => r.dueDate)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
  })
})

describe('depositReadiness', () => {
  const passed = (kind: KycKind): CheckSummary => ({ kind, status: 'passed', attempt: 1 })
  const base = {
    applicantType: 'individual' as const,
    consumerSigned: true,
    guarantorSigned: true,
    checks: [passed('nin'), passed('bvn'), passed('liveness')],
    livenessDeferred: false,
  }

  it('ready when both have signed and every check passed', () => {
    expect(depositReadiness(base)).toEqual({ ready: true, missing: [] })
  })

  it('a check with a person (manual_review) does not block the deposit', () => {
    const r = depositReadiness({
      ...base,
      checks: [{ kind: 'nin', status: 'manual_review', attempt: 3 }, passed('bvn')],
      livenessDeferred: true,
    })
    expect(r.ready).toBe(true)
  })

  it('lists what is missing: signatures and unfinished checks', () => {
    const r = depositReadiness({
      ...base,
      consumerSigned: false,
      guarantorSigned: false,
      checks: [passed('nin'), { kind: 'bvn', status: 'failed', attempt: 1 }],
    })
    expect(r.ready).toBe(false)
    expect(r.missing).toEqual([
      'Sign your payment plan agreement',
      'Your guarantor needs to sign',
      'Confirm your BVN',
      'Complete the face check',
    ])
  })

  it('a business also needs its CAC check', () => {
    const r = depositReadiness({ ...base, applicantType: 'business' })
    expect(r).toEqual({ ready: false, missing: ['Confirm your business registration (CAC)'] })
  })
})

describe('paystackSignatureValid', () => {
  const secret = 'sk_test_example'
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'r1' } })
  const good = createHmac('sha512', secret).update(body).digest('hex')

  it('accepts the HMAC-SHA512 of the raw body with the secret key', () => {
    expect(paystackSignatureValid(body, good, secret)).toBe(true)
  })
  it('rejects a wrong, missing or tampered signature', () => {
    expect(paystackSignatureValid(body, 'deadbeef', secret)).toBe(false)
    expect(paystackSignatureValid(body, null, secret)).toBe(false)
    expect(paystackSignatureValid(body + ' ', good, secret)).toBe(false)
    expect(paystackSignatureValid(body, good, '')).toBe(false)
  })
})
