import { describe, expect, it } from 'vitest'

import { priceQuote } from '@/lib/pricing/price'
import { DEFAULT_OFFER_TERMS, quoteOffer } from '@/lib/spewa/offer'

import { quoteBreakdown } from './breakdown'

const margins = { panels: 0.03, battery: 0.03, inverter: 0.03, accessories: 0.03 }

describe('quoteBreakdown', () => {
  it('home (PRD formula), Semako’s Kaduna 1 kVA example', () => {
    const q = priceQuote({
      lines: [
        { sku: 'INV-1', name: '1 kVA hybrid inverter 12v', category: 'inverter', unitCost: 170_000, qty: 1 },
        { sku: 'ACC-7.5', name: 'Protection, cables and mounting', category: 'accessories', unitCost: 180_000, qty: 1 },
      ],
      installCost: 200_000,
      noMarkup: [
        { label: 'Installation', amount: 100_000 },
        { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 100_000 },
      ],
      marginByCategory: margins,
      pricingRateAnnual: 0.24,
      tenureMonths: 12,
      depositShare: 0.2,
    })
    expect(quoteBreakdown(q)).toEqual({
      items: 493_688,
      installation: 100_000,
      delivery: 100_000,
      price: 693_688,
      depositShare: 0.2,
      deposit: 138_738,
      financed: 554_950,
      monthly: 46_246,
      months: 12,
      totalPayable: 693_688,
      offer: false,
    })
  })

  it('business (SPEWA offer): price before the charge; deposit 30% of it', () => {
    const q = priceQuote({
      lines: [
        { sku: 'SPW-SLS-0003', name: 'Solis 12kW', category: 'inverter', unitCost: 2_375_000, sellUnit: 2_665_000, qty: 1 },
      ],
      installCost: 350_000,
      noMarkup: [
        { label: 'Installation', amount: 250_000 },
        { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 100_000 },
      ],
      marginByCategory: margins,
      pricingRateAnnual: 0.3,
      tenureMonths: 12,
      depositShare: 0.3,
      minDepositShare: 0.3,
      offer: quoteOffer(DEFAULT_OFFER_TERMS, [3, 6, 9, 12]),
    })
    // Semako's item 30 check: total 3,648,150, deposit 904,500, 228,638 × 12.
    expect(quoteBreakdown(q)).toEqual({
      items: 2_665_000,
      installation: 250_000,
      delivery: 100_000,
      price: 3_015_000,
      depositShare: 0.3,
      deposit: 904_500,
      financed: 2_110_500,
      monthly: 228_638,
      months: 12,
      totalPayable: 3_648_150,
      offer: true,
    })
  })

  it('installation and delivery removed: zero', () => {
    const q = priceQuote({
      lines: [{ sku: 'X', name: 'X', category: 'inverter', unitCost: 100_000, qty: 1 }],
      installCost: 0,
      noMarkup: [],
      marginByCategory: margins,
      pricingRateAnnual: 0.24,
      tenureMonths: 12,
      depositShare: 0.2,
    })
    const b = quoteBreakdown(q)
    expect(b.installation).toBe(0)
    expect(b.delivery).toBe(0)
    expect(b.items).toBe(b.price)
  })
})
