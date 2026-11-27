import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { priceQuote } from '@/lib/pricing/price'
import { DEFAULT_QUOTE_SETTINGS } from '@/lib/settings/schemas'

import { buildEstimate, type Estimate } from './buildEstimate'
import { needsHomeTerms } from './leadForPlans'
import { SIZING_TOO_LARGE_NOTE, sizingNote, updateEstimateTerms } from './termsUpdate'

const s = DEFAULT_QUOTE_SETTINGS
const totals = computeLoadTotals(sampleHomeItems)

/** An estimate as it was before the ready-made terms: 24% a year, no `terms`. */
function oldEstimate(): Estimate {
  const e = buildEstimate(totals, 'Kaduna', 0.2, s)
  const plans = Object.fromEntries(
    Object.entries(e.plans).map(([k, p]) => {
      const snap = p.quote.snapshot
      const quote = priceQuote({
        lines: snap.lines,
        installCost: snap.installCost,
        noMarkup: snap.noMarkup,
        marginByCategory: snap.marginByCategory,
        pricingRateAnnual: 0.24,
        tenureMonths: 12,
        depositShare: 0.2,
        minDepositShare: 0.2,
      })
      return [k, { ...p, quote }]
    }),
  ) as Estimate['plans']
  return { ...e, plans }
}

const cost = (e: Estimate, plus = 0) =>
  new Map(
    Object.values(e.plans)
      .flatMap((p) => p.quote.snapshot.lines)
      .map((l) => [l.sku.toUpperCase(), l.unitCost + plus]),
  )

describe('one-time update to the 4% terms (method c: same items, today’s prices)', () => {
  it('keeps every item and quantity, uses today’s prices and the new terms, never mutates the old one', () => {
    const old = oldEstimate()
    const before = JSON.stringify(old)
    expect(needsHomeTerms(old)).toBe(true)
    const r = updateEstimateTerms(old, { settings: s, costBySku: cost(old, 1000), state: 'Kaduna' })
    expect(JSON.stringify(old)).toBe(before)
    expect(needsHomeTerms(r.estimate)).toBe(false)
    for (const plan of ['essential', 'comfort', 'independence'] as const) {
      const was = old.plans[plan].quote.snapshot.lines.filter((l) => !l.sku.startsWith('RACK-'))
      const now = r.estimate.plans[plan].quote.snapshot.lines
      expect(now.map((l) => [l.sku, l.qty])).toEqual(was.map((l) => [l.sku, l.qty]))
      expect(now.map((l) => l.unitCost)).toEqual(was.map((l) => l.unitCost + 1000))
      expect(r.estimate.plans[plan].size).toEqual(old.plans[plan].size)
      expect(r.estimate.plans[plan].quote.snapshot.terms).toBeTruthy()
    }
    expect(r.missing).toEqual([])
  })

  it('an item no longer sold keeps its old price and is reported', () => {
    const old = oldEstimate()
    const prices = cost(old)
    prices.delete('PNL-550')
    const r = updateEstimateTerms(old, { settings: s, costBySku: prices, state: 'Kaduna' })
    expect(r.missing).toEqual(['PNL-550'])
    const panel = r.estimate.plans.comfort.quote.snapshot.lines.find((l) => l.sku === 'PNL-550')
    expect(panel?.unitCost).toBe(
      old.plans.comfort.quote.snapshot.lines.find((l) => l.sku === 'PNL-550')?.unitCost,
    )
  })

  it('optionally swaps an oversized accessories pack for today’s right-size pack', () => {
    const base = oldEstimate()
    const big = (p: Estimate['plans']['comfort']) => ({
      ...p,
      quote: {
        ...p.quote,
        snapshot: {
          ...p.quote.snapshot,
          lines: p.quote.snapshot.lines.map((l) =>
            l.sku.startsWith('ACC-') ? { ...l, sku: 'ACC-20', unitCost: 300000 } : l,
          ),
        },
      },
    })
    const old: Estimate = {
      ...base,
      plans: {
        essential: big(base.plans.essential),
        comfort: big(base.plans.comfort),
        independence: big(base.plans.independence),
      },
    }
    const prices = new Map([...cost(base), ['ACC-20', 300000]])
    const keep = updateEstimateTerms(old, { settings: s, costBySku: prices, state: 'Kaduna' })
    const swap = updateEstimateTerms(old, {
      settings: s,
      costBySku: prices,
      state: 'Kaduna',
      rightSizePack: true,
    })
    for (const plan of ['essential', 'comfort', 'independence'] as const) {
      const kva = old.plans[plan].size.inverterKva
      const tier = [...s.priceList.accessoriesByKva]
        .sort((a, b) => a.maxKva - b.maxKva)
        .find((t) => kva <= t.maxKva)!
      const pack = (e: Estimate) =>
        e.plans[plan].quote.snapshot.lines.find((l) => l.sku.startsWith('ACC-'))!
      expect(pack(keep.estimate).sku).toBe('ACC-20')
      expect(pack(swap.estimate)).toMatchObject({
        sku: `ACC-${tier.maxKva}`,
        unitCost: tier.unitCost,
      })
    }
  })

  it('the chosen plan is re-priced at the same plan and deposit', () => {
    const base = oldEstimate()
    const old: Estimate = {
      ...base,
      chosen: { ...base.plans.essential, plan: 'essential', depositShare: 0.3, advice: null },
    } as Estimate
    const r = updateEstimateTerms(old, { settings: s, costBySku: cost(old), state: 'Kaduna' })
    const chosen = (r.estimate as Estimate & { chosen: { plan: string; depositShare: number } })
      .chosen
    expect(chosen.plan).toBe('essential')
    expect(chosen.depositShare).toBe(0.3)
    expect(
      (chosen as unknown as { quote: { snapshot: { depositShare: number } } }).quote.snapshot
        .depositShare,
    ).toBe(0.3)
  })
})

describe('sizing note for the call', () => {
  const at = (kva: number, kwh: number, panels: number) => ({
    inverterKva: kva,
    batteryKwh: kwh,
    panelCount: panels,
  })
  it('none when today’s sizing gives about the same system', () => {
    expect(sizingNote(at(2.5, 5, 3), { size: at(2.5, 5, 3), total: 1 })).toBeNull()
    expect(sizingNote(at(2.5, 10, 8), { size: at(2.5, 11, 9), total: 1 })).toBeNull()
  })
  it('a clearly different system (smaller or larger)', () => {
    expect(sizingNote(at(7.5, 12.5, 11), { size: at(2.5, 5, 2), total: 2415080 })).toBe(
      "Today's sizing suggests 2.5 kVA · 5 kWh · 2 panels at about ₦2,415,080 — mention this on the call.",
    )
    expect(sizingNote(at(1, 2.5, 1), { size: at(5, 5, 3), total: 2468340 })).toMatch(
      /^Today's sizing suggests 5 kVA/,
    )
  })
  it('load too big for one system', () => {
    expect(sizingNote(at(15, 90, 45), 'too-large')).toBe(SIZING_TOO_LARGE_NOTE)
    expect(SIZING_TOO_LARGE_NOTE).toBe(
      'Check appliance list on the call — load looks too big for one system.',
    )
  })
})
