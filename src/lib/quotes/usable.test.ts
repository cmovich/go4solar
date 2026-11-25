import { describe, expect, it } from 'vitest'

import { priceQuote } from '@/lib/pricing/price'
import { DEFAULT_OFFER_TERMS, quoteOffer } from '@/lib/spewa/offer'

import { usableQuote } from './usable'

const margins = { panels: 0.03, battery: 0.03, inverter: 0.03, accessories: 0.03 }
const home = priceQuote({
  lines: [{ sku: 'X', name: 'Inverter', category: 'inverter', unitCost: 100_000, qty: 1 }],
  installCost: 50_000,
  noMarkup: [{ label: 'Installation', amount: 50_000 }],
  marginByCategory: margins,
  pricingRateAnnual: 0.24,
  tenureMonths: 12,
  depositShare: 0.2,
})
const business = priceQuote({
  lines: [
    { sku: 'S', name: 'Solis', category: 'inverter', unitCost: 400_000, sellUnit: 450_000, qty: 1 },
  ],
  installCost: 50_000,
  noMarkup: [{ label: 'Installation', amount: 50_000 }],
  marginByCategory: margins,
  pricingRateAnnual: 0.3,
  tenureMonths: 12,
  depositShare: 0.3,
  minDepositShare: 0.3,
  offer: quoteOffer(DEFAULT_OFFER_TERMS, [3, 6, 9, 12]),
})

describe('usableQuote (stored quotes are read safely everywhere)', () => {
  it('a full quote is used; a quote without a SPEWA offer is fine (home quotes have none)', () => {
    expect(usableQuote(business)).toBe(business)
    expect(usableQuote(home)).toBe(home)
    expect(usableQuote(home)!.snapshot.offer).toBeUndefined()
  })

  it('missing quote, empty quote, missing snapshot, lines or instalments, wrong types: null', () => {
    expect(usableQuote(null)).toBeNull()
    expect(usableQuote(undefined)).toBeNull()
    expect(usableQuote({})).toBeNull()
    expect(usableQuote('x')).toBeNull()
    expect(usableQuote({ ...home, snapshot: undefined })).toBeNull()
    expect(usableQuote({ ...home, instalments: undefined })).toBeNull()
    expect(usableQuote({ ...home, lines: 'no' })).toBeNull()
    expect(usableQuote({ ...home, systemPrice: '100' })).toBeNull()
    expect(usableQuote({ ...home, snapshot: { ...home.snapshot, lines: undefined } })).toBeNull()
  })

  it('a SPEWA offer that is not an object is treated as missing (no crash later)', () => {
    const odd = { ...business, snapshot: { ...business.snapshot, offer: 'broken' } }
    expect(usableQuote(odd)!.snapshot.offer).toBeUndefined()
  })
})
