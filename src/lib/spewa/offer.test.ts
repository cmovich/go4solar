import { describe, expect, it } from 'vitest'

import { DepositOutOfRangeError, priceQuote } from '@/lib/pricing/price'
import type { QuoteInput } from '@/lib/pricing/types'
import { cashPrice } from '@/lib/quotes/quote'
import { SAMPLE_PRICE_LIST } from '@/lib/settings/schemas'

import {
  DEFAULT_OFFER_TERMS,
  HV_BATTERY_V,
  annualisedRates,
  businessOfferFrom,
  offerMinDepositText,
  financedTotal,
  offerEquipment,
  offerPriceList,
  offerProfit,
  offerTermsFrom,
  quoteOffer,
} from './offer'
import type { SpewaItem } from './priceList'

const offer = quoteOffer(DEFAULT_OFFER_TERMS, [3, 6, 9, 12])
const margins = { panels: 0.1, battery: 0.1, inverter: 0.1, accessories: 0.2 }

// Item 31: Solis 12kW/48V. Selling (installer) 2,200,000, partner (big dealer) 1,750,000.
const solis = {
  sku: 'SPW-SLS-0004',
  name: 'Solis 12kW/48V S6-EH1P12K03-NV-YD-L On Grid',
  category: 'inverter' as const,
  unitCost: 1_750_000,
  sellUnit: 2_200_000,
  qty: 1,
}
const input = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  lines: [solis],
  installCost: 0,
  marginByCategory: margins,
  pricingRateAnnual: 0.24,
  tenureMonths: 12,
  depositShare: 0.3,
  minDepositShare: 0.3,
  offer,
  ...over,
})

describe('financing charge bands', () => {
  it('₦1,000,000 financed → 1,075,000 / 1,150,000 / 1,225,000 / 1,300,000', () => {
    expect([3, 6, 9, 12].map((n) => financedTotal(1_000_000, offer, n as 3))).toEqual([
      1_075_000, 1_150_000, 1_225_000, 1_300_000,
    ])
  })

  it('the same through the price engine (₦2,000,000 at 50% deposit)', () => {
    const totals = ([3, 6, 9, 12] as const).map(
      (n) =>
        priceQuote(
          input({ lines: [{ ...solis, sellUnit: 2_000_000 }], tenureMonths: n, depositShare: 0.5 }),
        ).balance,
    )
    expect(totals).toEqual([1_075_000, 1_150_000, 1_225_000, 1_300_000])
  })

  it('bands are editable (setting)', () => {
    const terms = offerTermsFrom({ chargeByTenure: { 3: 0.05, 6: 0.1, 9: 0.2, 12: 0.25 } })
    expect(financedTotal(1_000_000, quoteOffer(terms, [12]), 12)).toBe(1_250_000)
  })

  it('a length outside the offer is refused', () => {
    expect(() => priceQuote(input({ tenureMonths: 18 }))).toThrow(/18 months/)
  })

  it('annualised rates list exactly the offer lengths', () => {
    expect(Object.keys(annualisedRates(offer)).map(Number)).toEqual([3, 6, 9, 12])
    expect(annualisedRates(offer)[3]).toBeCloseTo(0.3)
  })
})

describe('SPEWA offer price (item 31 example)', () => {
  const q = priceQuote(input())

  it('30% deposit 660,000; 12 months → 166,833 a month; total 2,662,000', () => {
    expect(q.deposit).toBe(660_000)
    expect(q.monthly).toBe(166_833)
    expect(q.instalments).toHaveLength(12)
    expect(q.instalments.reduce((a, b) => a + b, 0)).toBe(q.balance)
    expect(q.balance).toBe(2_002_000)
    expect(q.systemPrice).toBe(2_662_000)
  })

  it('lines add up to the total payable (the charge is part of the equipment price)', () => {
    expect(q.lines.reduce((s, l) => s + l.lineTotal, 0) + q.installCost).toBe(q.systemPrice)
    expect(q.costPrice).toBe(1_750_000)
  })

  it('keeps the offer and the selling prices in the snapshot', () => {
    expect(q.snapshot.offer).toEqual(offer)
    expect(q.snapshot.lines[0]!.sellUnit).toBe(2_200_000)
    expect(q.snapshot.minDepositShare).toBe(0.3)
  })

  it('cannot go below the 30% minimum', () => {
    expect(() => priceQuote(input({ depositShare: 0.29 }))).toThrow(DepositOutOfRangeError)
  })

  it('pay in full = the selling price, no financing charge', () => {
    expect(cashPrice(q.snapshot)).toBe(2_200_000)
  })

  it('accessories at cost + margin, installation never marked up', () => {
    const r = priceQuote(
      input({
        lines: [
          solis,
          { sku: 'ACC', name: 'Cables', category: 'accessories', unitCost: 100_000, qty: 1 },
        ],
        installCost: 150_000,
        depositShare: 0.3,
      }),
    )
    // Cash: 2,200,000 + 120,000 + 150,000 = 2,470,000; deposit 741,000; financed 1,729,000 × 1.3.
    expect(r.deposit).toBe(741_000)
    expect(r.balance).toBe(2_247_700)
    expect(r.systemPrice).toBe(741_000 + 2_247_700)
    expect(cashPrice(r.snapshot)).toBe(2_470_000)
    expect(r.noMarkup).toEqual([{ label: 'Installation and logistics', amount: 150_000 }])
    expect(r.lines.reduce((s, l) => s + l.lineTotal, 0) + 150_000).toBe(r.systemPrice)
  })
})

describe('offerProfit (staff only)', () => {
  it('item 31: profit before installation 881,200, 440,600 each', () => {
    const p = offerProfit(priceQuote(input()))!
    expect(p).toMatchObject({
      partnerPrice: 1_750_000,
      sellingPrice: 2_200_000,
      equipmentMargin: 450_000,
      financed: 1_540_000,
      financingCharge: 462_000,
      accessoriesMargin: 0,
      installation: 0,
      badDebt: 30_800,
      profit: 881_200,
      go4solar: 440_600,
      spewa: 440_600,
    })
  })

  it('adds the accessories margin; installation is passed through at cost', () => {
    const p = offerProfit(
      priceQuote(
        input({
          lines: [
            solis,
            { sku: 'ACC', name: 'Cables', category: 'accessories', unitCost: 100_000, qty: 1 },
          ],
          installCost: 150_000,
        }),
      ),
    )!
    expect(p.accessoriesMargin).toBe(20_000)
    expect(p.installation).toBe(150_000)
    expect(p.financed).toBe(1_729_000)
    expect(p.financingCharge).toBe(518_700)
    expect(p.badDebt).toBe(34_580)
    expect(p.profit).toBe(450_000 + 518_700 + 20_000 - 34_580)
  })

  it('null for a normal quote', () => {
    expect(offerProfit(priceQuote(input({ offer: undefined, minDepositShare: 0.2 })))).toBeNull()
  })
})

const spewa = (over: Partial<SpewaItem>): SpewaItem => ({
  id: over.code ?? 'id',
  itemNo: 1,
  category: 'Inverters',
  code: 'C',
  product: 'P',
  brand: null,
  warranty: null,
  prices: { showroom: 50, installer: 40, level_b: 30, level_a: 20, big_dealer: 10 },
  kind: 'inverter',
  ratingKw: 12,
  voltage: 48,
  highVoltage: false,
  kwh: null,
  watts: null,
  active: true,
  sortOrder: 1,
  ...over,
})

describe('offerEquipment and the partner / selling column switch', () => {
  const items = [
    spewa({ code: 'INV' }),
    spewa({ code: 'INV-HV', ratingKw: 50, voltage: null, highVoltage: true }),
    spewa({ code: 'BAT', category: 'Batteries', kind: 'battery', ratingKw: null, kwh: 15 }),
    spewa({ code: 'PNL-A', category: 'Solar panels', kind: 'panel', ratingKw: null, watts: 550 }),
    spewa({
      code: 'PNL-B',
      category: 'Solar panels',
      kind: 'panel',
      ratingKw: null,
      watts: 650,
      prices: { showroom: 50, installer: 40, level_b: 30, level_a: 20, big_dealer: 10 },
    }),
    spewa({ code: 'LGT', category: 'Lights', kind: 'light', ratingKw: null, watts: 100 }),
    spewa({ code: 'OFF', active: false }),
    spewa({ code: 'NOPRICE', prices: { ...spewa({}).prices, installer: null } }),
  ]

  it('defaults: partner = big dealer, selling = installer', () => {
    const eq = offerEquipment(items, DEFAULT_OFFER_TERMS)
    expect(eq.inverters.map((i) => i.sku)).toEqual(['INV', 'INV-HV'])
    expect(eq.inverters[0]).toMatchObject({ unitCost: 10, kva: 12, nominalVoltage: 48 })
    expect(eq.inverters[1]!.nominalVoltage).toBe(HV_BATTERY_V)
    expect(eq.sell).toMatchObject({ INV: 40, BAT: 40, 'PNL-A': 40, LGT: 40 })
    expect(eq.sell.OFF).toBeUndefined()
    expect(eq.sell.NOPRICE).toBeUndefined()
    expect(eq.lights.map((l) => l.sku)).toEqual(['LGT'])
  })

  it('switching the columns changes partner and selling prices', () => {
    const eq = offerEquipment(items, {
      ...DEFAULT_OFFER_TERMS,
      partnerColumn: 'installer',
      sellingColumn: 'showroom',
    })
    expect(eq.inverters[0]).toMatchObject({ unitCost: 40 })
    expect(eq.sell.INV).toBe(50)
    // NOPRICE has a showroom price and an installer… no: installer is null → still left out.
    expect(eq.sell.NOPRICE).toBeUndefined()
  })

  it('the panel used for sizing is the cheapest per watt (selling price)', () => {
    const list = offerPriceList(SAMPLE_PRICE_LIST, offerEquipment(items, DEFAULT_OFFER_TERMS))!
    expect(list.panel.sku).toBe('PNL-B')
    expect(list.inverters.map((i) => i.sku)).toEqual(['INV', 'INV-HV'])
    expect(list.batteries!.map((b) => b.sku)).toEqual(['BAT'])
    // Our accessories and installation stay.
    expect(list.accessoriesByKva).toEqual(SAMPLE_PRICE_LIST.accessoriesByKva)
    expect(list.installByState).toEqual(SAMPLE_PRICE_LIST.installByState)
  })

  it('no offer price list without an inverter, a battery and a panel', () => {
    expect(
      offerPriceList(SAMPLE_PRICE_LIST, offerEquipment([items[0]!], DEFAULT_OFFER_TERMS)),
    ).toBeNull()
  })
})

describe('offerTermsFrom', () => {
  it('missing or wrong fields take the defaults', () => {
    expect(offerTermsFrom(undefined)).toEqual(DEFAULT_OFFER_TERMS)
    expect(offerTermsFrom({ partnerColumn: 'nope', validityDays: 3 })).toEqual({
      ...DEFAULT_OFFER_TERMS,
      validityDays: 3,
    })
  })
})

describe('businessOfferFrom', () => {
  const items = [
    spewa({ code: 'INV' }),
    spewa({ code: 'BAT', category: 'Batteries', kind: 'battery', ratingKw: null, kwh: 15 }),
    spewa({ code: 'PNL', category: 'Solar panels', kind: 'panel', ratingKw: null, watts: 550 }),
  ]
  const rule = { funderId: 'f', minDepositShare: 0.3, tenures: [3, 6, 9, 12] as const }

  it('the offer from the rule (minimum deposit, lengths) and the terms', () => {
    const bo = businessOfferFrom({
      items,
      terms: DEFAULT_OFFER_TERMS,
      rule: { ...rule, tenures: [...rule.tenures] },
      base: SAMPLE_PRICE_LIST,
    })!
    expect(bo.minDepositShare).toBe(0.3)
    expect(bo.tenures).toEqual([3, 6, 9, 12])
    expect(bo.offer.chargeByTenure).toEqual({ 3: 0.075, 6: 0.15, 9: 0.225, 12: 0.3 })
    expect(bo.sell).toEqual({ INV: 40, BAT: 40, PNL: 40 })
  })

  it('no offer without a rule, without 12 months, or without SPEWA equipment', () => {
    const base = SAMPLE_PRICE_LIST
    const terms = DEFAULT_OFFER_TERMS
    expect(businessOfferFrom({ items, terms, rule: null, base })).toBeNull()
    expect(businessOfferFrom({ items, terms, rule: { ...rule, tenures: [3, 6] }, base })).toBeNull()
    expect(
      businessOfferFrom({ items: [], terms, rule: { ...rule, tenures: [12] }, base }),
    ).toBeNull()
  })

  it('the minimum deposit message', () => {
    expect(offerMinDepositText(0.3)).toBe('The minimum deposit for this offer is 30%')
  })
})
