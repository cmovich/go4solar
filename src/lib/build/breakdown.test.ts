import { describe, expect, it } from 'vitest'

import { priceQuote } from '@/lib/pricing/price'
import { DEFAULT_OFFER_TERMS, quoteOffer } from '@/lib/spewa/offer'

import { customerBreakdown, quoteBreakdown, safeBreakdown } from './breakdown'

const margins = { panels: 0.03, battery: 0.03, inverter: 0.03, accessories: 0.03 }

describe('quoteBreakdown', () => {
  it('home (PRD formula), Semako’s Kaduna 1 kVA example', () => {
    const q = priceQuote({
      lines: [
        {
          sku: 'INV-1',
          name: '1 kVA hybrid inverter 12v',
          category: 'inverter',
          unitCost: 170_000,
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
      charge: 0,
      balance: 554_950,
      monthly: 46_246,
      months: 12,
      totalPayable: 693_688,
      cashPrice: 560_500,
      offer: false,
    })
  })

  it('home on the ready-made terms: price before the charge, fixed cash price', () => {
    const q = priceQuote({
      lines: [{ sku: 'INV-1', name: '1 kVA', category: 'inverter', unitCost: 257_500, qty: 1 }],
      installCost: 200_000,
      noMarkup: [
        { label: 'Installation', amount: 100_000 },
        { label: 'Delivery to Kaduna', amount: 100_000 },
      ],
      marginByCategory: margins,
      pricingRateAnnual: 0.48,
      tenureMonths: 12,
      depositShare: 0.2,
      terms: { kind: 'flat', monthlyRate: 0.04, fullDiscount: 0.2 },
    })
    const b = quoteBreakdown(q)
    expect(b).toMatchObject({
      items: 265_225,
      price: 465_225,
      deposit: 93_045,
      financed: 372_180,
      charge: 178_646,
      balance: 550_826,
      totalPayable: 643_871,
      cashPrice: 515_097,
    })
    // What a customer's browser receives: the four figures, no amounts for parts.
    expect(customerBreakdown(b)).toEqual({
      items: 0,
      installation: 0,
      delivery: 0,
      price: 0,
      financed: 0,
      charge: 0,
      balance: 0,
      depositShare: 0.2,
      deposit: 93_045,
      monthly: 45_902,
      months: 12,
      totalPayable: 643_871,
      cashPrice: 515_097,
      hasInstallation: true,
      hasDelivery: true,
      offer: false,
      customer: true,
    })
  })

  it('business (SPEWA offer): price before the charge; deposit 30% of it', () => {
    const q = priceQuote({
      lines: [
        {
          sku: 'SPW-SLS-0003',
          name: 'Solis 12kW',
          category: 'inverter',
          unitCost: 2_375_000,
          sellUnit: 2_665_000,
          qty: 1,
        },
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
      charge: 633_150,
      balance: 2_743_650,
      monthly: 228_638,
      months: 12,
      totalPayable: 3_648_150,
      cashPrice: 3_015_000,
      offer: true,
    })
  })

  it('SPEWA demo (G4S-E7B59741): financed = price − deposit; the charge apart; balance to repay monthly', () => {
    const q = priceQuote({
      lines: [
        {
          sku: 'SPW-SLS-0011',
          name: 'Solis 5kW/48V',
          category: 'inverter',
          unitCost: 480_000,
          sellUnit: 520_000,
          qty: 1,
        },
        {
          sku: 'SPW-BAT',
          name: 'MUST 48V/5KWH',
          category: 'battery',
          unitCost: 900_000,
          sellUnit: 940_000,
          qty: 1,
        },
        {
          sku: 'SPW-PNL',
          name: '330W Sungene',
          category: 'panels',
          unitCost: 50_000,
          sellUnit: 56_500,
          qty: 3,
        },
        {
          sku: 'ACC',
          name: 'Protection, cables and mounting',
          category: 'accessories',
          unitCost: 180_000,
          sellUnit: 185_400,
          qty: 1,
        },
      ],
      installCost: 225_050,
      noMarkup: [
        { label: 'Installation', amount: 125_050 },
        { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 100_000 },
      ],
      marginByCategory: margins,
      pricingRateAnnual: 0.3,
      tenureMonths: 12,
      depositShare: 0.3,
      minDepositShare: 0.3,
      offer: quoteOffer(DEFAULT_OFFER_TERMS, [3, 6, 9, 12]),
    })
    const b = quoteBreakdown(q)
    expect(b.price).toBe(2_039_950)
    expect(b.deposit).toBe(611_985)
    expect(b.financed).toBe(1_427_965)
    expect(b.charge).toBe(428_390)
    expect(b.balance).toBe(1_856_355)
    expect(b.monthly).toBe(154_696)
    expect(b.totalPayable).toBe(2_468_340)
    expect(b.deposit + b.balance).toBe(b.totalPayable)
    expect(b.financed + b.charge).toBe(b.balance)
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

describe('safeBreakdown (quotes stored in older formats)', () => {
  it('a quote saved before installation was itemised (no noMarkup list): no crash', () => {
    const q = priceQuote({
      lines: [{ sku: 'X', name: 'X', category: 'inverter', unitCost: 100_000, qty: 1 }],
      installCost: 50_000,
      noMarkup: [{ label: 'Installation', amount: 50_000 }],
      marginByCategory: margins,
      pricingRateAnnual: 0.24,
      tenureMonths: 12,
      depositShare: 0.2,
    })
    const old = { ...q, noMarkup: undefined } as unknown as typeof q
    const b = safeBreakdown(old)
    expect(b).not.toBeNull()
    expect(b!.financed).toBe(q.systemPrice - q.deposit)
    expect(b!.balance).toBe(q.systemPrice - q.deposit)
  })

  it('an empty or broken quote: null (shown as —), never a crash', () => {
    expect(safeBreakdown({} as never)).toBeNull()
    expect(safeBreakdown(null)).toBeNull()
    expect(safeBreakdown({ systemPrice: 100 } as never)).toBeNull()
  })
})
