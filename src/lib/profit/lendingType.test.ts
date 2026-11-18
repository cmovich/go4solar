import { describe, expect, it } from 'vitest'

import { loanProfit } from './loanProfit'

const noCosts = { kycPerLoan: 0, feePerInstalment: 0, lossProvisionShare: 0 }

// Oga Boss, 12 months, 20% deposit: price ₦1,307,000, vendor cost ₦1,102,500, Trade Lenda 4% a
// month flat (0.48 a year). Customer: deposit ₦261,400, ₦1,808,888 total payable.
describe('loanProfit by lending type (Trade Lenda)', () => {
  it('lends to Go4Solar: drawn = the customer’s amount financed, never cost − deposit', () => {
    const p = loanProfit({
      systemPrice: 1_808_888,
      costPrice: 1_102_500,
      deposit: 261_400,
      tenureMonths: 12,
      funderAnnualRate: 0.48,
      funderMethod: 'flat',
      unitCosts: noCosts,
      lendingType: 'go4solar',
      customerFinanced: 1_045_600,
    })
    expect(p.drawn).toBe(1_045_600)
    expect(p.funderInterest).toBe(501_888) // 1,045,600 × 4% × 12
    // Customer payments − cost − Trade Lenda interest.
    expect(p.grossProfit).toBe(1_808_888 - 1_102_500 - 501_888)
  })

  it('lends to the customer: Trade Lenda pays the price upfront; no funder interest', () => {
    const p = loanProfit({
      systemPrice: 1_307_000,
      costPrice: 1_102_500,
      deposit: 261_400,
      tenureMonths: 12,
      funderAnnualRate: 0.48,
      funderMethod: 'flat',
      unitCosts: { kycPerLoan: 5_000, feePerInstalment: 100, lossProvisionShare: 0.03 },
      lendingType: 'customer',
    })
    expect(p.drawn).toBe(0)
    expect(p.funderInterest).toBe(0)
    expect(p.grossProfit).toBe(204_500) // price − cost
    // Trade Lenda collects the payments and carries the risk: only our KYC cost remains.
    expect(p.directCosts).toBe(5_000)
    expect(p.annualReturnOnDrawn).toBeNull()
  })

  it('no lending type: unchanged (drawn = cost − deposit)', () => {
    const p = loanProfit({
      systemPrice: 1_808_888,
      costPrice: 1_102_500,
      deposit: 261_400,
      tenureMonths: 12,
      funderAnnualRate: 0.48,
      funderMethod: 'flat',
      unitCosts: noCosts,
    })
    expect(p.drawn).toBe(841_100)
  })
})
