import { describe, expect, it } from 'vitest'

import { priceQuote } from '@/lib/pricing/price'
import { priceReadyPlan, readyQuoteResult } from '@/lib/readyPlans/price'
import { ogaBoss } from '@/lib/tradeLenda/fixture'

import { priceInFullOf } from './priceInFull'

describe('priceInFullOf', () => {
  it('a ready-made plan: the plan price (Oga Boss ₦1,307,000)', () => {
    const q = readyQuoteResult(ogaBoss, priceReadyPlan(ogaBoss, 12), 'Kaduna')
    expect(priceInFullOf(q, { kind: 'ready' })).toBe(1_307_000)
  })
  it('a builder or calculator quote: items at cost + margin + installation (no plan cost)', () => {
    const q = priceQuote({
      lines: [{ sku: 'INV-5', name: 'Inverter', category: 'inverter', unitCost: 400_000, qty: 1 }],
      installCost: 150_000,
      marginByCategory: { panels: 0.03, battery: 0.03, inverter: 0.03, accessories: 0.03 },
      pricingRateAnnual: 0.24,
      tenureMonths: 12,
      depositShare: 0.2,
    })
    expect(priceInFullOf(q, { kind: 'builder' })).toBe(412_000 + 150_000)
    expect(priceInFullOf(null, null)).toBeNull()
  })
})
