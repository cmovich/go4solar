import { describe, expect, it } from 'vitest'

import { SEEDED_PLANS } from '@/lib/readyPlans/plans.fixture'
import { DEFAULT_READY_TERMS, withTerms } from '@/lib/readyPlans/terms'
import { readyPlanBasis, type PlanBasis } from '@/lib/tradeLenda/planBasis'

import { exportFinancing, exportTotals } from './financing'

const oga = withTerms(
  SEEDED_PLANS.find((p) => p.slug === 'oga-boss')!,
  DEFAULT_READY_TERMS,
)
const ogaBasis = readyPlanBasis(oga, 12)
const spewaDemo: PlanBasis = {
  label: 'Your own system',
  items: [],
  priceInFull: 2_039_950,
  cost: 1_929_550,
  quoted: {
    price: 2_468_340,
    depositShare: 0.3,
    deposit: 611_985,
    totalPayable: 2_468_340,
    monthly: 154_696,
  },
  planCharge: 428_390,
}

describe('exportFinancing: what each funder sees (Basic and Full alike)', () => {
  it('Trade Lenda (lends to the customer), Oga Boss, 12 months', () => {
    const f = exportFinancing(
      ogaBasis,
      { kind: 'trade-lenda', monthlyRate: 0.04, lendingType: 'customer' },
      {
        depositShare: 0.2,
        months: 12,
        depositPaid: 0,
      },
    )
    expect(f).toEqual({
      months: 12,
      deposit: 261_400,
      depositStatus: 'to be paid',
      depositPaid: 0,
      financed: 1_045_600,
      monthly: 128_957,
      totalRepayment: 1_547_488,
      earnings: 501_888,
    })
  })

  it('Trade Lenda (lends to Go4Solar): the same drawn amount ₦1,045,600', () => {
    const f = exportFinancing(
      ogaBasis,
      { kind: 'trade-lenda', monthlyRate: 0.04, lendingType: 'go4solar' },
      {
        depositShare: 0.2,
        months: 12,
        depositPaid: 0,
      },
    )
    expect([f.financed, f.earnings, f.totalRepayment]).toEqual([1_045_600, 501_888, 1_547_488])
  })

  it('SPEWA (business offer): its charge is its earnings; ₦154,696 × 12', () => {
    const f = exportFinancing(
      spewaDemo,
      { kind: 'spewa', annualRate: 0.16 },
      { depositShare: 0.3, months: 12, depositPaid: 611_985 },
    )
    expect(f).toEqual({
      months: 12,
      deposit: 611_985,
      depositStatus: 'paid',
      depositPaid: 611_985,
      financed: 1_427_965,
      monthly: 154_696,
      totalRepayment: 1_856_355,
      earnings: 428_390,
    })
  })

  it('any other funder: its own yearly rate, flat, on what it finances (never our margin)', () => {
    const f = exportFinancing(
      ogaBasis,
      { kind: 'rate', annualRate: 0.24 },
      { depositShare: 0.2, months: 12, depositPaid: 100_000 },
    )
    expect(f.financed).toBe(1_045_600)
    expect(f.earnings).toBe(Math.round(1_045_600 * 0.02 * 12))
    expect(f.depositStatus).toBe('to be paid')
    expect(f.depositPaid).toBe(100_000)
    expect(f.earnings).toBe(f.totalRepayment - f.financed)
    expect(f.earnings).not.toBe(ogaBasis.quoted.totalPayable - ogaBasis.cost)
  })
})

describe('exportTotals (batch summary)', () => {
  it('adds up people, levels, deposits paid / to be paid, financed, repayment and earnings', () => {
    const a = exportFinancing(
      ogaBasis,
      { kind: 'trade-lenda', monthlyRate: 0.04, lendingType: 'customer' },
      { depositShare: 0.2, months: 12, depositPaid: 261_400 },
    )
    const b = exportFinancing(
      ogaBasis,
      { kind: 'trade-lenda', monthlyRate: 0.04, lendingType: 'customer' },
      { depositShare: 0.2, months: 12, depositPaid: 0 },
    )
    expect(
      exportTotals([
        { level: 'full', financing: a },
        { level: 'basic', financing: b },
      ]),
    ).toEqual({
      people: 2,
      basic: 1,
      full: 1,
      depositsPaid: 261_400,
      depositsToPay: 261_400,
      financed: 2_091_200,
      totalRepayment: 3_094_976,
      earnings: 1_003_776,
      monthly: 257_914,
    })
  })
})
