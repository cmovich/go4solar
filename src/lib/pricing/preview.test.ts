import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { loanProfit } from '@/lib/profit/loanProfit'
import { buildEstimate } from '@/lib/quotes/buildEstimate'
import { DEFAULT_QUOTE_SETTINGS } from '@/lib/settings/schemas'

import { SAMPLE_PACKAGES, buildPreview, type PreviewFunder } from './preview'

const s = DEFAULT_QUOTE_SETTINGS
const unitCosts = { kycPerLoan: 10000, feePerInstalment: 300, lossProvisionShare: 0.02 }
const funders: PreviewFunder[] = [
  { id: 'a', name: 'SPEWA programme funds', annualRate: 0.16, status: 'active' },
  { id: 'b', name: 'Trade Lenda', annualRate: 0.2, status: 'active' },
  { id: 'c', name: 'Go4Solar own fund', annualRate: 0, status: 'active' },
  { id: 'd', name: 'Paused funder', annualRate: 0.3, status: 'paused' },
]

describe('buildPreview', () => {
  const totals = computeLoadTotals(sampleHomeItems)
  const base = {
    settings: s,
    totals,
    state: 'Lagos' as const,
    plan: 'comfort' as const,
    funders,
    unitCosts,
  }

  it('is exactly what the waiting-list estimate shows for the same inputs', () => {
    const p = buildPreview({ ...base, tenureMonths: 12, depositShare: 0.2 })
    const est = buildEstimate(totals, 'Lagos', 0.2, s).plans.comfort
    expect(p.size).toEqual(est.size)
    expect(p.systemPrice).toBe(est.quote.systemPrice)
    expect(p.deposit).toBe(est.quote.deposit)
    expect(p.monthly).toBe(est.quote.monthly)
    expect(p.installCost).toBe(est.quote.installCost)
    expect(p.lines.map((l) => l.lineTotal)).toEqual(est.quote.lines.map((l) => l.lineTotal))
  })

  it('shows cost, markup % and selling price per line, and the lines add up to the total', () => {
    const p = buildPreview({ ...base, tenureMonths: 12, depositShare: 0.2 })
    for (const l of p.lines) {
      expect(l.lineCost).toBe(l.unitCost * l.qty)
      expect(l.lineTotal).toBeGreaterThan(l.lineCost)
      expect(l.markupShare).toBeCloseTo(p.markupShare, 2)
    }
    expect(p.lines.reduce((a, l) => a + l.lineTotal, 0) + p.installCost).toBe(p.systemPrice)
  })

  it("Go4Solar's side is loanProfit per ACTIVE funder (paused ones are left out)", () => {
    const p = buildPreview({ ...base, tenureMonths: 12, depositShare: 0.2 })
    expect(p.funders.map((f) => f.name)).toEqual([
      'SPEWA programme funds',
      'Trade Lenda',
      'Go4Solar own fund',
    ])
    const direct = loanProfit({
      systemPrice: p.systemPrice,
      costPrice: p.costPrice,
      deposit: p.deposit,
      tenureMonths: 12,
      funderAnnualRate: 0.16,
      funderMethod: 'flat',
      unitCosts,
    })
    expect(p.funders[0]?.profit).toEqual(direct)
    // A 0% own fund earns more than a 16% funder; both are positive at these sample margins.
    expect(p.funders[2]!.profit.netProfit).toBeGreaterThan(p.funders[0]!.profit.netProfit)
  })

  it('uses the tenure-specific pricing rate and a shorter tenure costs less in total', () => {
    const settings = {
      ...s,
      pricing: { ...s.pricing, pricingRateByTenure: { ...s.pricing.pricingRateByTenure, 3: 0.06 } },
    }
    const three = buildPreview({ ...base, settings, tenureMonths: 3, depositShare: 0.2 })
    const twelve = buildPreview({ ...base, settings, tenureMonths: 12, depositShare: 0.2 })
    expect(three.systemPrice).toBeLessThan(twelve.systemPrice)
    expect(three.monthly).toBeGreaterThan(twelve.monthly)
  })

  it('the price-vs-deposit curve runs 20%→95% and falls as the deposit rises', () => {
    const p = buildPreview({ ...base, tenureMonths: 12, depositShare: 0.5 })
    expect(p.curve[0]?.depositPct).toBe(20)
    expect(p.curve[p.curve.length - 1]?.depositPct).toBe(95)
    for (let i = 1; i < p.curve.length; i++) {
      expect(p.curve[i]!.systemPrice).toBeLessThanOrEqual(p.curve[i - 1]!.systemPrice)
    }
    const at50 = p.curve.find((c) => c.depositPct === 50)
    expect(at50?.systemPrice).toBe(p.systemPrice)
  })

  it('a negative margin shows as a negative net profit (never clamped)', () => {
    const p = buildPreview({
      ...base,
      funders: [{ id: 'x', name: 'Expensive', annualRate: 0.9, status: 'active' }],
      tenureMonths: 12,
      depositShare: 0.2,
    })
    expect(p.funders[0]!.profit.netProfit).toBeLessThan(0)
  })

  it('ships three sample packages that all size within the stocked inverters', () => {
    expect(SAMPLE_PACKAGES.map((p) => p.id)).toEqual(['small-home', 'family-home', 'shop'])
    for (const pkg of SAMPLE_PACKAGES) {
      const p = buildPreview({ ...base, totals: pkg.totals, tenureMonths: 12, depositShare: 0.2 })
      expect(p.size.inverterKva).toBeGreaterThan(0)
    }
  })
})
