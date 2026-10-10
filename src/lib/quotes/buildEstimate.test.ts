import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { priceQuote } from '@/lib/pricing/price'
import { DEFAULT_QUOTE_SETTINGS, SAMPLE_PRICE_LIST } from '@/lib/settings/schemas'

import { PLANS, buildEstimate, repriceEstimate } from './buildEstimate'

const totals = computeLoadTotals(sampleHomeItems) // 480 W, 780 W surge, 3.72 kWh/day
const s = DEFAULT_QUOTE_SETTINGS

describe('buildEstimate — PRD sample home, Lagos, 20% deposit', () => {
  const est = buildEstimate(totals, 'Lagos', 0.2, s)

  it('returns the three plans in order, each sized and priced at 12 months', () => {
    expect(PLANS).toEqual(['essential', 'comfort', 'independence'])
    for (const plan of PLANS) {
      const p = est.plans[plan]
      expect(p.plan).toBe(plan)
      expect(p.quote.snapshot.tenureMonths).toBe(12)
      expect(p.quote.snapshot.depositShare).toBe(0.2)
      expect(p.quote.systemPrice).toBeGreaterThan(0)
    }
  })

  it('comfort plan: 1 kVA, 7.5 kWh (3 modules), 5 panels, priced from the sample list', () => {
    const c = est.plans.comfort
    expect(c.size).toMatchObject({ inverterKva: 1, batteryKwh: 7.5, panelCount: 5 })
    const lines = Object.fromEntries(c.quote.lines.map((l) => [l.category, l]))
    expect(lines.panels).toMatchObject({ sku: 'PNL-550', qty: 5, unitCost: 120000 })
    expect(lines.battery).toMatchObject({ sku: 'BAT-2.5', qty: 3, unitCost: 450000 })
    expect(lines.inverter).toMatchObject({ sku: 'INV-1', qty: 1, unitCost: 180000 })
    expect(lines.accessories).toMatchObject({ qty: 1, unitCost: 60000 })
    expect(c.quote.installCost).toBe(200000) // Lagos
    // Cost price = 600,000 + 1,350,000 + 180,000 + 60,000 + 200,000
    expect(c.quote.costPrice).toBe(2390000)
    // Exactly what priceQuote gives for those lines (12 months, 20%).
    const direct = priceQuote({
      lines: c.quote.lines.map(({ sku, name, category, unitCost, qty }) => ({
        sku,
        name,
        category,
        unitCost,
        qty,
      })),
      installCost: 200000,
      marginByCategory: s.pricing.marginByCategory,
      pricingRateAnnual: 0.24,
      tenureMonths: 12,
      depositShare: 0.2,
    })
    expect(c.quote.systemPrice).toBe(direct.systemPrice)
    expect(c.quote.monthly).toBe(direct.monthly)
  })

  it('essential costs less than comfort; independence sits between on battery', () => {
    expect(est.plans.essential.quote.systemPrice).toBeLessThan(est.plans.comfort.quote.systemPrice)
    expect(est.plans.independence.size.batteryKwh).toBe(5)
  })

  it('uses the state installation cost (Other falls back to its own price)', () => {
    expect(buildEstimate(totals, 'FCT', 0.2, s).plans.essential.quote.installCost).toBe(150000)
    expect(buildEstimate(totals, 'Other', 0.2, s).plans.essential.quote.installCost).toBe(200000)
  })

  it('Other is priced with FCT sun hours (conservative middle value)', () => {
    const other = buildEstimate(totals, 'Other', 0.2, s)
    const fct = buildEstimate(totals, 'FCT', 0.2, s)
    expect(other.plans.comfort.size.panelCount).toBe(fct.plans.comfort.size.panelCount)
  })

  it('records whether sample prices were used', () => {
    expect(est.sample).toBe(true)
    const real = buildEstimate(totals, 'Lagos', 0.2, {
      ...s,
      priceList: { ...SAMPLE_PRICE_LIST, sample: false },
      pricing: { ...s.pricing, sample: false },
    })
    expect(real.sample).toBe(false)
  })

  it('picks the right accessories tier and inverter for a bigger load', () => {
    const big = computeLoadTotals([
      {
        ...sampleHomeItems[0]!,
        id: 'ac',
        name: 'AC',
        watts: 1800,
        qty: 2,
        hoursPerDay: 8,
        surgeFactor: 3,
        dutyCycle: 0.5,
      },
    ])
    const e = buildEstimate(big, 'Lagos', 0.2, s)
    // 3600 W running, surge 7200 → 9000 VA → 10 kVA
    expect(e.plans.essential.size.inverterKva).toBe(10)
    const lines = Object.fromEntries(e.plans.essential.quote.lines.map((l) => [l.category, l]))
    expect(lines.inverter).toMatchObject({ sku: 'INV-10' })
    expect(lines.accessories).toMatchObject({ unitCost: 300000 })
  })
})

describe('repriceEstimate — contribution slider', () => {
  const est = buildEstimate(totals, 'Lagos', 0.2, s)

  it('re-prices the chosen plan at a new deposit without resizing it', () => {
    const at50 = repriceEstimate(est, 'comfort', 0.5)
    expect(at50.size).toEqual(est.plans.comfort.size)
    expect(at50.quote.snapshot.depositShare).toBe(0.5)
    expect(at50.quote.systemPrice).toBeLessThan(est.plans.comfort.quote.systemPrice)
    expect(at50.quote.deposit).toBeGreaterThan(est.plans.comfort.quote.deposit)
    expect(at50.quote.monthly).toBeLessThan(est.plans.comfort.quote.monthly)
  })

  it('saving = system price at 20% − system price at N%', () => {
    const at50 = repriceEstimate(est, 'comfort', 0.5)
    expect(at50.savingVsMin).toBe(est.plans.comfort.quote.systemPrice - at50.quote.systemPrice)
    expect(repriceEstimate(est, 'comfort', 0.2).savingVsMin).toBe(0)
  })
})
