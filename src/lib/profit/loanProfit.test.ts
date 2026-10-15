import { describe, expect, it } from 'vitest'

import { sampleUnitCosts } from '@/lib/pricing/pricing.fixture'

import { loanProfit } from './loanProfit'
import type { LoanProfitInput } from './types'

// The PRD's 20% / 12-month illustration (system price from priceQuote).
const base: LoanProfitInput = {
  systemPrice: 2475248,
  costPrice: 1800000,
  deposit: 495050,
  tenureMonths: 12,
  funderAnnualRate: 0.16,
  funderMethod: 'flat',
  unitCosts: sampleUnitCosts,
}

describe('loanProfit — PRD illustration', () => {
  it('Funder A at 16%, flat', () => {
    const p = loanProfit(base)
    expect(p.drawn).toBe(1304950)
    expect(p.funderInterest).toBe(208792)
    expect(p.grossProfit).toBe(466456)
    expect(p.directCosts).toBe(10000 + 300 * 12 + 39604)
    expect(p.netProfit).toBe(413252)
    expect(p.netPerMonth).toBe(34438)
    expect(p.customerMonthly).toBe(165017)
    expect(p.funderMonthly).toBe(126145)
    expect(p.annualReturnOnDrawn).toBeCloseTo(0.3167, 4)
  })

  it('Funder B at 26%', () => {
    const p = loanProfit({ ...base, funderAnnualRate: 0.26 })
    expect(p.funderInterest).toBe(339287)
    expect(p.grossProfit).toBe(335961)
  })

  it('own fund at 0% pays no interest', () => {
    const p = loanProfit({ ...base, funderAnnualRate: 0 })
    expect(p.funderInterest).toBe(0)
    expect(p.grossProfit).toBe(675248)
    expect(p.funderMonthly).toBe(Math.round(1304950 / 12))
  })

  it('95% deposit: nothing drawn, no interest, return is null not Infinity', () => {
    const p = loanProfit({ ...base, systemPrice: 2024291, deposit: 1923076 })
    expect(p.drawn).toBe(0)
    expect(p.funderInterest).toBe(0)
    expect(p.funderMonthly).toBe(0)
    expect(p.annualReturnOnDrawn).toBeNull()
    expect(p.grossProfit).toBe(2024291 - 1800000)
    expect(Number.isFinite(p.netProfit)).toBe(true)
  })
})

describe('loanProfit — rules', () => {
  it('interest is charged on the money drawn, pro rata to the tenure', () => {
    const p3 = loanProfit({ ...base, tenureMonths: 3 })
    expect(p3.funderInterest).toBe(Math.round(1304950 * 0.16 * (3 / 12)))
  })

  it('a deposit larger than the cost price never makes drawn negative', () => {
    const p = loanProfit({ ...base, deposit: 1900000 })
    expect(p.drawn).toBe(0)
    expect(p.funderInterest).toBe(0)
  })

  it('net profit can be negative and is reported as such (never clamped)', () => {
    const p = loanProfit({ ...base, funderAnnualRate: 0.6 })
    expect(p.grossProfit).toBeLessThan(0)
    expect(p.netProfit).toBeLessThan(p.grossProfit)
    expect(p.annualReturnOnDrawn).toBeLessThan(0)
  })

  it('loss provision is on the financed balance (system price − deposit)', () => {
    const p = loanProfit({ ...base, unitCosts: { ...sampleUnitCosts, lossProvisionShare: 0.1 } })
    expect(p.directCosts).toBe(10000 + 3600 + Math.round(0.1 * (2475248 - 495050)))
  })
})
