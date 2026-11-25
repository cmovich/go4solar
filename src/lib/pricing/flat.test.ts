import { describe, expect, it } from 'vitest'

import { basePrice, cashPrice } from '@/lib/quotes/quote'

import { flatRates, flatTermsFrom, HOME_TENURES } from './flat'
import { priceQuote } from './price'
import type { QuoteInput } from './types'

/**
 * Home quotes on the ready-made plan terms (Semako, 25 Nov 2026): price = items at cost + base
 * margins + installation + delivery; deposit = d × price; total = deposit + financed × (1 + 4% ×
 * months); cash price = the 12-month total at a 20% deposit × (1 − 20%), whatever the slider says.
 */
const terms = flatTermsFrom({ monthlyRate: 0.04, fullDiscount: 0.2 })

// 1 kVA in Kaduna: equipment ₦257,500 at cost (+3% = ₦265,225), installation and delivery ₦100,000 each.
const oneKva = (depositShare: number, tenureMonths: 6 | 9 | 12 = 12): QuoteInput => ({
  lines: [
    { sku: 'INV-1', name: '1 kVA inverter', category: 'inverter', unitCost: 257_500, qty: 1 },
  ],
  installCost: 200_000,
  noMarkup: [
    { label: 'Installation', amount: 100_000 },
    { label: 'Delivery to Kaduna', amount: 100_000 },
  ],
  marginByCategory: { panels: 0.03, battery: 0.03, inverter: 0.03, accessories: 0.03 },
  pricingRateAnnual: 0.48,
  tenureMonths,
  depositShare,
  minDepositShare: 0.2,
  terms,
})

describe('home quotes on the ready-made terms', () => {
  it('offers 6, 9 and 12 months', () => {
    expect(HOME_TENURES).toEqual([6, 9, 12])
    expect(Object.keys(flatRates(terms)).map(Number)).toEqual([6, 9, 12])
  })

  it('1 kVA, 20% deposit, 12 months: Semako’s figures', () => {
    const q = priceQuote(oneKva(0.2))
    expect(basePrice(q.snapshot)).toBe(465_225)
    expect(q.deposit).toBe(93_045)
    expect(q.balance).toBe(550_826)
    expect(q.instalments).toEqual([...Array(11).fill(45_902), 45_904])
    expect(q.monthly).toBe(45_902)
    expect(q.systemPrice).toBe(643_871)
    expect(cashPrice(q.snapshot)).toBe(515_097)
    // Items at cost + margin, installation and delivery at cost; the charge is staff-only.
    expect(q.lines[0]!.lineTotal).toBe(265_225)
    expect(q.planCharge).toEqual({ label: 'Payment plan charge (12 months, 48%)', amount: 178_646 })
    expect(q.snapshot.terms).toEqual(terms)
  })

  it('the cash price does not move with the deposit or the length', () => {
    for (const d of [0.2, 0.35, 0.6, 0.95])
      for (const n of [6, 9, 12] as const)
        expect(cashPrice(priceQuote(oneKva(d, n)).snapshot)).toBe(515_097)
  })

  it('a bigger deposit or a shorter length lowers the total', () => {
    const q6 = priceQuote(oneKva(0.2, 6))
    expect(q6.balance).toBe(Math.round(372_180 * 1.24))
    expect(q6.instalments).toHaveLength(6)
    expect(q6.instalments.reduce((a, b) => a + b, 0)).toBe(q6.balance)
    const q50 = priceQuote(oneKva(0.5))
    expect(q50.deposit).toBe(232_613)
    expect(q50.systemPrice).toBe(232_613 + Math.round((465_225 - 232_613) * 1.48))
  })

  it('keeps the 20%–95% deposit range', () => {
    expect(() => priceQuote(oneKva(0.19))).toThrow(RangeError)
    expect(() => priceQuote(oneKva(0.96))).toThrow(RangeError)
  })

  it('reads the setting field by field (defaults 4% and 20%)', () => {
    expect(flatTermsFrom(null)).toEqual({ kind: 'flat', monthlyRate: 0.04, fullDiscount: 0.2 })
    expect(flatTermsFrom({ monthlyRate: 0.05 })).toEqual({
      kind: 'flat',
      monthlyRate: 0.05,
      fullDiscount: 0.2,
    })
  })

  it('quotes without the terms keep the old formula (documents already issued)', () => {
    const old = priceQuote({ ...oneKva(0.2), pricingRateAnnual: 0.24, terms: undefined })
    expect(old.snapshot.terms).toBeUndefined()
    expect(old.planCharge).toBeUndefined()
    expect(cashPrice(old.snapshot)).toBe(465_225)
  })
})
