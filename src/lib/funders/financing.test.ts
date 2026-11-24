import { describe, expect, it } from 'vitest'

import { priceQuote } from '@/lib/pricing/price'
import { SEEDED_PLANS } from '@/lib/readyPlans/plans.fixture'
import { DEFAULT_READY_TERMS, withTerms } from '@/lib/readyPlans/terms'
import {
  customerFigures,
  go4solarFigures,
  monthlyRateOf,
  tradeLendaDrawn,
} from '@/lib/tradeLenda/figures'
import { quoteBasis, readyPlanBasis } from '@/lib/tradeLenda/planBasis'

import { funderFinancing } from './financing'
// Trade Lenda's figures exactly as they were BEFORE funderFinancing() (captured 24 Nov 2026).
import golden from './financing.golden.json'

const r = monthlyRateOf(0.48)
const oga = withTerms(
  SEEDED_PLANS.find((p) => p.slug === 'oga-boss')!,
  DEFAULT_READY_TERMS,
)

// A builder system: one 5 kVA inverter + a pack, installation and delivery, our PRD price.
const builderQuote = priceQuote({
  lines: [
    {
      sku: 'INV-5',
      name: '5 kVA hybrid inverter',
      category: 'inverter',
      unitCost: 400_000,
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
  installCost: 250_000,
  noMarkup: [
    { label: 'Installation', amount: 150_000 },
    { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 100_000 },
  ],
  marginByCategory: { panels: 0.03, battery: 0.03, inverter: 0.03, accessories: 0.03 },
  pricingRateAnnual: 0.24,
  tenureMonths: 12,
  depositShare: 0.2,
})
const builder = quoteBasis('Own system', builderQuote, 0.2, 12, { 12: 0.24 })

const basis = readyPlanBasis(oga, 12)

describe('funderFinancing: one function for every funder', () => {
  it('Trade Lenda, Oga Boss, 12 months: financed ₦1,045,600, ₦128,957 a month, repayment ₦1,547,488, earnings ₦501,888', () => {
    const f = funderFinancing({
      kind: 'monthly-rate',
      priceInFull: 1_307_000,
      deposit: 261_400,
      months: 12,
      monthlyRate: r,
    })
    expect(f).toMatchObject({
      financed: 1_045_600,
      monthly: 128_957,
      totalRepayment: 1_547_488,
      earnings: 501_888,
      months: 12,
    })
  })

  it('SPEWA demo: financed ₦1,427,965, charge ₦428,390 (its earnings), ₦154,696 × 12', () => {
    const f = funderFinancing({
      kind: 'charge',
      price: 2_039_950,
      deposit: 611_985,
      charge: 428_390,
      months: 12,
    })
    expect(f).toMatchObject({
      financed: 1_427_965,
      earnings: 428_390,
      monthly: 154_696,
      totalRepayment: 1_856_355,
    })
    expect(f.instalments.reduce((a, b) => a + b, 0)).toBe(1_856_355)
  })

  it('the funder’s earnings are only the interest/charge on what it finances (never our margin)', () => {
    const f = funderFinancing({
      kind: 'monthly-rate',
      priceInFull: 1_307_000,
      deposit: 261_400,
      months: 12,
      monthlyRate: r,
    })
    expect(f.earnings).toBe(f.totalRepayment - f.financed)
  })
})

describe('Trade Lenda results are EXACTLY the same as before the refactor', () => {
  it('Oga Boss, lends to the customer (every field)', () => {
    expect(
      customerFigures({ price: basis.priceInFull, depositShare: 0.2, months: 12, monthlyRate: r }),
    ).toEqual(golden.ogaCustomer)
  })
  it('Oga Boss, lends to Go4Solar (every field): drawn ₦1,045,600 in both lending types', () => {
    const g = go4solarFigures({
      priceInFull: basis.priceInFull,
      quoted: basis.quoted,
      months: 12,
      monthlyRate: r,
    })
    expect(g).toEqual(golden.ogaGo4solar)
    expect(g.financed).toBe(1_045_600)
    expect(golden.ogaCustomer.financed).toBe(1_045_600)
  })
  it('a builder system, both lending types (every field)', () => {
    expect(
      customerFigures({
        price: builder.priceInFull,
        depositShare: 0.2,
        months: 12,
        monthlyRate: r,
      }),
    ).toEqual(golden.builderCustomer)
    expect(
      go4solarFigures({
        priceInFull: builder.priceInFull,
        quoted: builder.quoted,
        months: 12,
        monthlyRate: r,
      }),
    ).toEqual(golden.builderGo4solar)
  })
  it('the balance taken at approval is the same drawn amount as before', () => {
    expect(tradeLendaDrawn({ priceInFull: 1_307_000, deposit: 261_400 })).toBe(1_045_600)
  })
})
