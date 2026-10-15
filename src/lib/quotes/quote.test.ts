import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { DEFAULT_QUOTE_SETTINGS } from '@/lib/settings/schemas'

import { buildEstimate } from './buildEstimate'
import { cashPrice, estimateIsStale, priceVariant, quoteReference, validUntil } from './quote'

const totals = computeLoadTotals(sampleHomeItems)
const s = DEFAULT_QUOTE_SETTINGS

describe('priceVariant', () => {
  const est = buildEstimate(totals, 'Lagos', 0.2, s)

  it('at 12 months / 20% it is exactly the stored estimate', () => {
    const v = priceVariant(est, 'comfort', 12, 0.2)
    expect(v.quote.systemPrice).toBe(est.plans.comfort.quote.systemPrice)
    expect(v.quote.monthly).toBe(est.plans.comfort.quote.monthly)
    expect(v.savingVsMin).toBe(0)
  })

  it('shorter tenures cost less in total but more per month; bigger deposits save money', () => {
    const t3 = priceVariant(est, 'comfort', 3, 0.2)
    const t12 = priceVariant(est, 'comfort', 12, 0.2)
    expect(t3.quote.systemPrice).toBeLessThan(t12.quote.systemPrice)
    expect(t3.quote.monthly).toBeGreaterThan(t12.quote.monthly)
    const d50 = priceVariant(est, 'comfort', 12, 0.5)
    expect(d50.savingVsMin).toBe(t12.quote.systemPrice - d50.quote.systemPrice)
    expect(d50.savingVsMin).toBeGreaterThan(0)
  })

  it('uses the per-tenure pricing rate stored in the estimate', () => {
    const cheap3 = { ...est, pricingRateByTenure: { ...est.pricingRateByTenure, 3: 0 } }
    const v = priceVariant(cheap3, 'comfort', 3, 0.2)
    // A 0% rate means no financing markup: price = cost with margins + installation.
    expect(v.quote.systemPrice).toBe(cashPrice(est.plans.comfort.quote.snapshot))
  })

  it('a quote snapshot does not change when pricing changes', () => {
    const stored = structuredClone(est)
    const quoted = priceVariant(stored, 'comfort', 6, 0.3)
    // Admin doubles the panel cost and raises every rate…
    const dearer = buildEstimate(totals, 'Lagos', 0.2, {
      ...s,
      priceList: { ...s.priceList, panel: { ...s.priceList.panel, unitCost: 240000 } },
      pricing: {
        ...s.pricing,
        pricingRateByTenure: { 3: 0.4, 6: 0.4, 9: 0.4, 12: 0.4 },
        pricingRateAnnual: 0.4,
      },
    })
    expect(dearer.plans.comfort.quote.systemPrice).toBeGreaterThan(
      est.plans.comfort.quote.systemPrice,
    )
    // …but the stored estimate still prices exactly as before.
    expect(priceVariant(stored, 'comfort', 6, 0.3)).toEqual(quoted)
  })
})

describe('cashPrice', () => {
  it('is cost + base margins + installation (no financing)', () => {
    const snap = buildEstimate(totals, 'Lagos', 0.2, s).plans.comfort.quote.snapshot
    const expected = Math.round(
      snap.lines.reduce(
        (a, l) => a + l.unitCost * l.qty * (1 + snap.marginByCategory[l.category]),
        0,
      ) + snap.installCost,
    )
    expect(cashPrice(snap)).toBe(expected)
  })
})

describe('quoteReference / validUntil / estimateIsStale', () => {
  it('formats a short, readable reference', () => {
    expect(quoteReference('3f9a1c2e-0000-4000-8000-000000000000')).toBe('G4S-3F9A1C2E')
  })

  it('adds the validity days', () => {
    const now = new Date('2026-10-10T12:00:00Z')
    expect(validUntil(now, 7).toISOString()).toBe('2026-10-17T12:00:00.000Z')
  })

  it('an estimate older than the validity window is stale', () => {
    const now = new Date('2026-10-20T00:00:00Z')
    expect(estimateIsStale('2026-10-10T00:00:00Z', 7, now)).toBe(true)
    expect(estimateIsStale('2026-10-15T00:00:00Z', 7, now)).toBe(false)
    expect(estimateIsStale(null, 7, now)).toBe(true)
  })
})
