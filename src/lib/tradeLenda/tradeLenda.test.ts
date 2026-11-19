import { describe, expect, it } from 'vitest'

import { priceQuote } from '@/lib/pricing/price'
import { SEEDED_PLANS } from '@/lib/readyPlans/plans.fixture'
import { DEFAULT_READY_TERMS, withTerms } from '@/lib/readyPlans/terms'

import { batchLabel, batchTotals, nextBatchNumber } from './batch'
import { customerFigures, go4solarFigures, monthlyRateOf } from './figures'
import { quoteBasis, readyPlanBasis } from './planBasis'
import { completeness, lastFour, sendProblems, type ProfileValues } from './profile'
import { makeSnapshot } from './fixture'
import { funderSafetyProblems } from './snapshot'

const r = monthlyRateOf(0.48)
const oga = withTerms(
  SEEDED_PLANS.find((p) => p.slug === 'oga-boss')!,
  DEFAULT_READY_TERMS,
)

// A builder system: one 5 kVA inverter + a pack, installation and delivery, our PRD price.
const builderQuote = priceQuote({
  lines: [
    {
      sku: 'INV-5',
      name: '5 kVA hybrid inverter',
      category: 'inverter',
      unitCost: 400_000,
      qty: 1,
    },
    {
      sku: 'ACC-7.5',
      name: 'Protection, cables and mounting',
      category: 'accessories',
      unitCost: 180_000,
      qty: 1,
    },
  ],
  installCost: 250_000,
  noMarkup: [
    { label: 'Installation', amount: 150_000 },
    { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 100_000 },
  ],
  marginByCategory: { panels: 0.03, battery: 0.03, inverter: 0.03, accessories: 0.03 },
  pricingRateAnnual: 0.24,
  tenureMonths: 12,
  depositShare: 0.2,
})
const builder = quoteBasis('Own system', builderQuote, 0.2, 12, { 12: 0.24 })

describe('monthly rate', () => {
  it('0.48 a year = 4% a month', () => expect(r).toBe(0.04))
})

describe('Oga Boss, 12 months, 20% deposit', () => {
  const basis = readyPlanBasis(oga, 12)
  it('lends to the customer: price in full ₦1,307,000, financed × (1 + 0.04 × 12)', () => {
    const f = customerFigures({
      price: basis.priceInFull,
      depositShare: 0.2,
      months: 12,
      monthlyRate: r,
    })
    expect(f).toMatchObject({
      price: 1_307_000,
      deposit: 261_400,
      financed: 1_045_600,
      charge: 501_888,
      monthly: 128_957,
      totalRepayment: 1_808_888,
    })
  })
  it('lends to Go4Solar: drawn = the customer’s amount financed (price − deposit), not cost', () => {
    const f = go4solarFigures({
      priceInFull: basis.priceInFull,
      quoted: basis.quoted,
      months: 12,
      monthlyRate: r,
    })
    expect(f).toMatchObject({
      financed: 1_045_600,
      charge: 501_888,
      totalRepayment: 1_547_488,
      customerTotalPayable: 1_808_888,
      customerMonthly: 128_957,
    })
    expect(basis.cost).toBe(1_102_500)
    expect(f.financed).not.toBe(basis.cost - basis.quoted.deposit)
  })
})

describe('a builder system, 12 months, 20% deposit', () => {
  // Paid in full: 412,000 + 185,400 + 250,000 = 847,400 (no payment-plan cost).
  it('lends to the customer: worked on the price paid in full', () => {
    expect(builder.priceInFull).toBe(847_400)
    const f = customerFigures({ price: 847_400, depositShare: 0.2, months: 12, monthlyRate: r })
    expect(f).toMatchObject({
      deposit: 169_480,
      financed: 677_920,
      totalRepayment: 169_480 + 1_003_322,
    })
  })
  it('lends to Go4Solar: the customer keeps our quoted figures; drawn = price paid in full − deposit', () => {
    const f = go4solarFigures({
      priceInFull: builder.priceInFull,
      quoted: builder.quoted,
      months: 12,
      monthlyRate: r,
    })
    expect(builder.quoted.price).toBe(builderQuote.systemPrice)
    expect(f.financed).toBe(847_400 - builderQuote.deposit)
    expect(f.customerTotalPayable).toBe(builderQuote.systemPrice)
  })
})

const values: ProfileValues = {
  firstName: 'Ada',
  surname: 'Obi',
  phone: '+2348031234567',
  dateOfBirth: '1990-01-01',
  state: 'Kaduna',
  lga: 'Kaduna North',
  street: '1 Ahmadu Bello Way',
  landmark: 'Near the market',
  employmentType: 'employed',
  incomeRange: '250k_500k',
  ninLast4: '4521',
  bvnLast4: '7788',
  guarantorName: 'Bayo Obi',
  guarantorPhone: '+2348039876543',
  guarantorRelationship: 'Brother',
  planKind: 'ready',
  planRef: 'oga-boss',
  depositShare: 0.2,
  months: 12,
}

describe('profile', () => {
  it('NIN/BVN: only the last 4 digits are kept', () => {
    expect(lastFour('12345678901')).toBe('8901')
    expect(lastFour('4521')).toBe('4521')
    expect(lastFour('123')).toBeNull()
  })
  it('completeness lists what is missing', () => {
    expect(completeness(values)).toMatchObject({ done: 18, total: 18, missing: [] })
    expect(completeness({ ...values, landmark: null, bvnLast4: null }).missing).toEqual([
      'landmark',
      'BVN (last 4)',
    ])
  })
  it('sending needs complete + verified + consent + agreed figures of the same type, unchanged', () => {
    const f = customerFigures({ price: 1_307_000, depositShare: 0.2, months: 12, monthlyRate: r })
    const ticks = { phoneVerifiedAt: 'x', consentAt: 'x', figuresAgreedAt: 'x', figuresAgreed: f }
    expect(sendProblems(values, ticks, 'customer', f)).toEqual([])
    expect(sendProblems(values, ticks, 'go4solar', f)).toEqual([
      'The customer agreed to figures for the other lending type.',
    ])
    expect(
      sendProblems(values, ticks, 'customer', { ...f, totalRepayment: f.totalRepayment + 1 }),
    ).toEqual(['The figures changed since the customer agreed: confirm them again on the phone.'])
    expect(sendProblems(values, { ...ticks, consentAt: null }, 'customer', f)).toEqual([
      'No consent to share with Trade Lenda.',
    ])
  })
})

const snap = makeSnapshot

describe('funder snapshot (never our cost, margins, profit or item prices)', () => {
  it('both lending types: nothing forbidden; lends to Go4Solar: no cost figure either', () => {
    const basis = readyPlanBasis(oga, 12)
    const costs = [
      basis.cost,
      ...oga.lines.map((l) => l.vendorCost),
      ...oga.lines.map((l) => l.price),
    ]
    expect(funderSafetyProblems(snap('customer'))).toEqual([])
    expect(funderSafetyProblems(snap('go4solar'), costs)).toEqual([])
  })
  it('the check catches a leak', () => {
    expect(funderSafetyProblems({ unitCost: 1 })).toContain('contains "unitcost"')
    expect(funderSafetyProblems('Total 1,102,500', [1_102_500])).toEqual([
      'contains a cost figure (1102500)',
    ])
  })
})

describe('batches', () => {
  it('numbers and labels', () => {
    expect(nextBatchNumber('TL', [])).toBe('TL-Batch-001')
    expect(nextBatchNumber('TL', ['TL-Batch-001', 'TL-Batch-009'])).toBe('TL-Batch-010')
    expect(batchLabel('TL-Batch-001', 2, 'go4solar')).toBe('TL-Batch-001 v2 · Lends to Go4Solar')
  })
  it('totals, split by plan and by months', () => {
    const a = snap('customer')
    const t = batchTotals('customer', [a, a])
    expect(t).toMatchObject({
      customers: 2,
      totalCostToCustomers: 2_614_000,
      totalDeposits: 522_800,
      totalFinanced: 2_091_200,
      totalRepayments: 3_617_776,
      monthlyRepaymentsDue: 257_914,
    })
    expect(t.byMonths['12']).toMatchObject({ customers: 2 })
    expect(Object.keys(t.byPlan)).toEqual(['Oga Boss (ready-made plan)'])
  })
})

describe('test batches never use real numbers', () => {
  it('test series TLT-…, real series TL-…, each counted on its own', () => {
    expect(nextBatchNumber('TLT', ['TLT-Batch-006'])).toBe('TLT-Batch-007')
    expect(nextBatchNumber('TL', [])).toBe('TL-Batch-001')
  })
})
