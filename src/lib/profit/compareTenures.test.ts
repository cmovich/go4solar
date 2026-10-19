import { describe, expect, it } from 'vitest'

import { sampleQuoteInput, sampleUnitCosts } from '@/lib/pricing/pricing.fixture'
import { TENURES } from '@/lib/pricing/types'

import { compareTenures } from './compareTenures'

const base = {
  quote: sampleQuoteInput, // 20% deposit, 24% pricing rate
  funderAnnualRate: 0.16,
  funderMethod: 'flat' as const,
  unitCosts: sampleUnitCosts,
}

describe('compareTenures — PRD "Which repayment plans make more money" table', () => {
  const rows = compareTenures(
    base,
    TENURES.filter((t) => t <= 12),
  )

  it('returns one row per tenure, in the order asked', () => {
    expect(rows.map((r) => r.tenureMonths)).toEqual([3, 6, 9, 12])
  })

  it('3 months', () => {
    const r = rows[0]!
    expect(r.systemPrice).toBe(2100840)
    expect(r.monthly).toBe(560224)
    expect(r.netProfit).toBe(201134)
    expect(r.netPerMonth).toBe(67045)
    expect(r.annualReturnOnDrawn).toBeCloseTo(0.583, 3)
  })

  it('6 months', () => {
    const r = rows[1]!
    expect(r.systemPrice).toBe(2212389)
    expect(r.monthly).toBe(294985)
    expect(r.netProfit).toBeCloseTo(256589, -1) // PRD ₦256,589 (±₦1 rounding)
    expect(r.annualReturnOnDrawn).toBeCloseTo(0.378, 3)
  })

  it('9 months', () => {
    const r = rows[2]!
    expect(r.systemPrice).toBe(2336449)
    expect(r.monthly).toBe(207684)
    expect(r.netProfit).toBeCloseTo(326440, -1)
    expect(r.annualReturnOnDrawn).toBeCloseTo(0.327, 3)
  })

  it('12 months', () => {
    const r = rows[3]!
    expect(r.systemPrice).toBe(2475248)
    expect(r.monthly).toBe(165017)
    expect(r.netProfit).toBe(413252)
    expect(r.netPerMonth).toBe(34438)
    expect(r.annualReturnOnDrawn).toBeCloseTo(0.3167, 4)
  })

  it('longer tenures earn more per customer but less per naira drawn', () => {
    const net = rows.map((r) => r.netProfit)
    const ret = rows.map((r) => r.annualReturnOnDrawn ?? 0)
    expect(net).toEqual([...net].sort((a, b) => a - b))
    expect(ret).toEqual([...ret].sort((a, b) => b - a))
  })

  it('each row carries the full quote and profit for drill-down', () => {
    const r = rows[3]!
    expect(r.quote.systemPrice).toBe(r.systemPrice)
    expect(r.profit.netProfit).toBe(r.netProfit)
    expect(r.quote.snapshot.tenureMonths).toBe(12)
  })
})
