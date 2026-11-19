import { describe, expect, it } from 'vitest'

import { balanceDrawFor, eligibleFunders, funderOptions, optionKey, type FunderRow } from './rules'

const noCosts = { kycPerLoan: 0, feePerInstalment: 0, lossProvisionShare: 0 }
const base: Omit<FunderRow, 'id' | 'name' | 'annualRate'> = {
  minAmount: 0,
  maxAmount: null,
  maxTenure: 12,
  balanceAvailable: 10_000_000,
  status: 'active',
}
const tradeLenda: FunderRow = {
  ...base,
  id: 'tl',
  name: 'Trade Lenda',
  annualRate: 0.48,
  lendingTypes: ['customer', 'go4solar'],
}
const spewa: FunderRow = { ...base, id: 'sp', name: 'SPEWA', annualRate: 0.16 }
// Oga Boss, 12 months, 20%: customer pays 1,808,888; price paid in full 1,307,000; cost 1,102,500.
const loan = {
  systemPrice: 1_808_888,
  costPrice: 1_102_500,
  deposit: 261_400,
  balance: 1_547_488,
  tenure: 12 as const,
  priceInFull: 1_307_000,
}

describe('approval options by lending type', () => {
  const opts = funderOptions([tradeLenda, spewa], loan, noCosts, {
    recordedFees: 0,
    minNetMarginShare: 0,
  })

  it('Trade Lenda gives one option per lending type; SPEWA one, the old way', () => {
    expect(opts.map(optionKey)).toEqual(['tl:customer', 'tl:go4solar', 'sp'])
  })

  it('lends to the customer: profit = price paid in full − cost; no funder interest', () => {
    const o = opts.find((x) => optionKey(x) === 'tl:customer')!
    expect(o.profit).toMatchObject({ drawn: 0, funderInterest: 0, grossProfit: 204_500 })
  })

  it('lends to Go4Solar: drawn = the customer’s amount financed; interest at 4% a month', () => {
    const o = opts.find((x) => optionKey(x) === 'tl:go4solar')!
    // Customer financed = 1,808,888 − 261,400 = 1,547,488 (the customer's amount financed).
    expect(o.profit.drawn).toBe(1_547_488)
    expect(o.profit.funderInterest).toBe(Math.round(1_547_488 * 0.48))
  })

  it('SPEWA (no lending type): drawn = cost − deposit, as before', () => {
    expect(opts.find((x) => optionKey(x) === 'sp')!.profit.drawn).toBe(841_100)
  })
})

describe('Trade Lenda balance: the customer’s amount financed, for both lending types', () => {
  const opts = funderOptions([tradeLenda, spewa], loan, noCosts, {
    recordedFees: 0,
    minNetMarginShare: 0,
  })
  it('lends to the customer: price paid in full − deposit', () => {
    expect(
      balanceDrawFor(
        opts.find((o) => optionKey(o) === 'tl:customer')!,
        loan,
      ),
    ).toBe(1_045_600)
  })
  it('lends to Go4Solar: our price − deposit (never cost − deposit)', () => {
    expect(
      balanceDrawFor(
        opts.find((o) => optionKey(o) === 'tl:go4solar')!,
        loan,
      ),
    ).toBe(1_547_488)
  })
  it('other funders: cost − deposit, as before', () => {
    expect(
      balanceDrawFor(
        opts.find((o) => optionKey(o) === 'sp')!,
        loan,
      ),
    ).toBe(841_100)
  })
  it('a lending-type funder needs the larger of the two in its balance', () => {
    expect(eligibleFunders([{ ...tradeLenda, balanceAvailable: 1_100_000 }], loan)).toEqual([])
    expect(eligibleFunders([{ ...tradeLenda, balanceAvailable: 1_600_000 }], loan)).toHaveLength(1)
  })
})
