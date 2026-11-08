import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { priceQuote } from '@/lib/pricing/price'
import { DEFAULT_QUOTE_SETTINGS } from '@/lib/settings/schemas'

import { adjustPlan } from './adjust'
import { buildEstimate, repriceEstimate } from './buildEstimate'

const s = DEFAULT_QUOTE_SETTINGS
const est = buildEstimate(computeLoadTotals(sampleHomeItems), 'Lagos', 0.2, s)
const old = est.plans.comfort
// The customer added two panels in the builder.
const quote = priceQuote({
  ...old.quote.snapshot,
  lines: old.quote.snapshot.lines.map((l) =>
    l.category === 'panels' ? { ...l, qty: l.qty + 2 } : l,
  ),
  installCost: old.quote.snapshot.installCost,
})
const size = {
  inverterKva: old.size.inverterKva,
  batteryKwh: old.size.batteryKwh,
  panelCount: old.size.panelCount + 2,
  panelKw: old.size.panelKw + 1.1,
  backupHoursFullLoad: old.size.backupHoursFullLoad,
  realisticBackupHours: null,
}

describe('adjustPlan ("Adjust this quote" updates one plan of the same estimate)', () => {
  const next = adjustPlan(est, 'comfort', quote, size, 550)

  it('replaces only that plan: its price and size, marked adjusted', () => {
    expect(next.plans.comfort.quote.systemPrice).toBe(quote.systemPrice)
    expect(next.plans.comfort.quote.systemPrice).toBeGreaterThan(old.quote.systemPrice)
    expect(next.plans.comfort.size).toMatchObject({
      panelCount: old.size.panelCount + 2,
      panelWatts: 550,
    })
    expect(next.plans.comfort.adjusted).toBe(true)
    expect(next.plans.essential).toEqual(est.plans.essential)
    expect(next.plans.independence).toEqual(est.plans.independence)
  })

  it('keeps everything else of the estimate (state, grid, rates, sample flag)', () => {
    expect({ ...next, plans: null }).toEqual({ ...est, plans: null })
  })

  it('the adjusted plan still re-prices at other deposits (deposit step works)', () => {
    const at50 = repriceEstimate(next, 'comfort', 0.5)
    expect(at50.quote.systemPrice).toBeLessThan(next.plans.comfort.quote.systemPrice)
  })
})
