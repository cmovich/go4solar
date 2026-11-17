import { describe, expect, it } from 'vitest'

import { SEEDED_PLANS } from './plans.fixture'
import { priceReadyPlan } from './price'
import {
  DEFAULT_READY_TERMS,
  readyTermsForm,
  readyTermsFrom,
  termsToForm,
  withTerms,
} from './terms'

const plan = (slug: string) =>
  withTerms(
    SEEDED_PLANS.find((p) => p.slug === slug)!,
    DEFAULT_READY_TERMS,
  )

describe('ready-made plans: 4% a month, 20% off for paying in full (Semako, 17 Nov)', () => {
  // [monthly, total payable, pay in full] at 12 months, Kaduna.
  const figures: [string, number, number, number][] = [
    ['i-pass-my-neighbour', 45_880, 643_560, 514_848],
    ['level-up', 83_571, 1_172_248, 937_798],
    ['oga-boss', 128_957, 1_808_888, 1_447_110],
    ['no-wahala', 140_797, 1_974_968, 1_579_974],
    ['no-shaking', 190_920, 2_678_040, 2_142_432],
    ['relax', 337_440, 4_733_280, 3_786_624],
    ['relax-max', 600_091, 8_417_488, 6_733_990],
  ]
  for (const [slug, monthly, total, cash] of figures) {
    it(slug, () => {
      const p = priceReadyPlan(plan(slug), 12)
      expect([p.monthly, p.totalPayable, p.fullPayment]).toEqual([monthly, total, cash])
      // Deposit stays 20% of the price; total = financed × (1 + 0.04 × 12).
      expect(p.deposit).toBe(Math.round(p.planPrice * 0.2))
      expect(p.total).toBe(Math.round(p.financed * 1.48))
    })
  }

  it('the terms apply to every plan, whatever is stored on the plan row', () => {
    const raw = SEEDED_PLANS[0]!
    const p = withTerms({ ...raw, monthlyRate: 0.05, fullDiscount: 0.25 }, DEFAULT_READY_TERMS)
    expect(p.monthlyRate).toBe(0.04)
    expect(p.fullDiscount).toBe(0.2)
  })
})

describe('readyTermsFrom (settings.ready_plan_terms)', () => {
  it('defaults: 4% a month, 20% off', () => {
    expect(readyTermsFrom(undefined)).toEqual({ monthlyRate: 0.04, fullDiscount: 0.2 })
    expect(readyTermsFrom({ monthlyRate: 0.035 })).toEqual({
      monthlyRate: 0.035,
      fullDiscount: 0.2,
    })
    expect(readyTermsFrom({ monthlyRate: 'x', fullDiscount: 2 })).toEqual(DEFAULT_READY_TERMS)
  })
})

describe('admin form (percent on screen)', () => {
  it('round trip and limits', () => {
    expect(termsToForm(DEFAULT_READY_TERMS)).toEqual({ monthlyRatePct: 4, fullDiscountPct: 20 })
    expect(readyTermsForm.parse({ monthlyRatePct: 4, fullDiscountPct: 20 })).toEqual(
      DEFAULT_READY_TERMS,
    )
    expect(readyTermsForm.safeParse({ monthlyRatePct: 25, fullDiscountPct: 20 }).success).toBe(
      false,
    )
    expect(readyTermsForm.safeParse({ monthlyRatePct: 4, fullDiscountPct: 90 }).success).toBe(false)
  })
})
