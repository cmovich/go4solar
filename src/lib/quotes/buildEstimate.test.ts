import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadTotals } from '@/lib/load/types'
import { NG_STATE_IDS } from '@/lib/nigeria/states'
import { priceQuote } from '@/lib/pricing/price'
import { DEFAULT_QUOTE_SETTINGS, SAMPLE_PRICE_LIST } from '@/lib/settings/schemas'

import { PLANS, buildEstimate, monthlyByTenure, repriceEstimate } from './buildEstimate'

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
    expect(est.state).toBe('Lagos')
  })

  it('comfort plan: 1 kVA, 7.5 kWh (3 modules), 4 panels, priced from the sample list', () => {
    const c = est.plans.comfort
    expect(c.size).toMatchObject({ inverterKva: 1, batteryKwh: 7.5, panelCount: 4 })
    const lines = Object.fromEntries(c.quote.lines.map((l) => [l.category, l]))
    expect(lines.panels).toMatchObject({ sku: 'PNL-550', qty: 4, unitCost: 120000 })
    expect(lines.battery).toMatchObject({ sku: 'BAT-2.5', qty: 3, unitCost: 450000 })
    expect(lines.inverter).toMatchObject({ sku: 'INV-1', qty: 1, unitCost: 180000 })
    expect(lines.accessories).toMatchObject({ qty: 1, unitCost: 60000 })
    expect(c.quote.installCost).toBe(200000) // Lagos
    // Cost price = 480,000 + 1,350,000 + 180,000 + 60,000 + 200,000
    expect(c.quote.costPrice).toBe(2270000)
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

  it('independence: 10 kWh (4 modules) and 4 panels', () => {
    const i = est.plans.independence
    expect(i.size).toMatchObject({ batteryKwh: 10, panelCount: 4 })
    expect(i.quote.lines.find((l) => l.category === 'battery')?.qty).toBe(4)
  })

  it('launch states use their own installation price; every other state uses "Other"', () => {
    expect(buildEstimate(totals, 'FCT', 0.2, s).plans.essential.quote.installCost).toBe(150000)
    expect(buildEstimate(totals, 'Kaduna', 0.2, s).plans.essential.quote.installCost).toBe(150000)
    expect(buildEstimate(totals, 'Lagos', 0.2, s).plans.essential.quote.installCost).toBe(200000)
    expect(buildEstimate(totals, 'Enugu', 0.2, s).plans.essential.quote.installCost).toBe(200000)
    expect(buildEstimate(totals, 'Kano', 0.2, s).plans.essential.quote.installCost).toBe(200000)
  })

  it('sizing does not depend on the state (only the installation price does)', () => {
    const lagos = buildEstimate(totals, 'Lagos', 0.2, s)
    const sokoto = buildEstimate(totals, 'Sokoto', 0.2, s)
    for (const plan of PLANS) expect(sokoto.plans[plan].size).toEqual(lagos.plans[plan].size)
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

describe('buildEstimate — invariants over random loads', () => {
  // Deterministic pseudo-random so a failure is reproducible.
  let seed = 20261010
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const randomTotals = (): LoadTotals => {
    const runningW = Math.round(100 + rand() * 7900) // 100–8000 W (stays below the 20 kVA cap)
    const surgeW = Math.round(runningW * (1 + rand())) // up to 2× running
    const dailyKwh = Math.round(((runningW * (1 + rand() * 23)) / 1000) * 100) / 100 // 1–24 h/day
    return {
      runningW,
      surgeW,
      dailyKwh,
      byCategoryW: {
        lighting: runningW,
        tv_electronics: 0,
        kitchen: 0,
        cooling: 0,
        laundry: 0,
        water_outdoor: 0,
        business: 0,
      },
      heavyItems: [],
    }
  }

  it('battery, panels and system price never decrease essential → comfort → independence', () => {
    for (let i = 0; i < 300; i++) {
      const t = randomTotals()
      const state = NG_STATE_IDS[Math.floor(rand() * NG_STATE_IDS.length)]!
      const deposit = 0.2 + Math.round(rand() * 75) / 100
      const e = buildEstimate(t, state, deposit, s)
      const [es, co, ind] = [e.plans.essential, e.plans.comfort, e.plans.independence]
      const label = `load ${t.runningW} W / ${t.surgeW} W / ${t.dailyKwh} kWh, ${state}, ${deposit}`
      expect(co.size.batteryKwh, label).toBeGreaterThanOrEqual(es.size.batteryKwh)
      expect(ind.size.batteryKwh, label).toBeGreaterThanOrEqual(co.size.batteryKwh)
      expect(co.size.panelCount, label).toBeGreaterThanOrEqual(es.size.panelCount)
      expect(ind.size.panelCount, label).toBeGreaterThanOrEqual(co.size.panelCount)
      expect(co.quote.systemPrice, label).toBeGreaterThanOrEqual(es.quote.systemPrice)
      expect(ind.quote.systemPrice, label).toBeGreaterThanOrEqual(co.quote.systemPrice)
      // and the same inverter for all three (it depends on the load, not the plan)
      expect(ind.size.inverterKva, label).toBe(es.size.inverterKva)
    }
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

describe('monthlyByTenure', () => {
  it('prices the chosen plan at 3/6/9/12 months; shorter tenures cost more per month', () => {
    const est = buildEstimate(totals, 'Lagos', 0.2, s)
    const rows = monthlyByTenure(est.plans.comfort)
    expect(rows.map((r) => r.tenureMonths)).toEqual([3, 6, 9, 12])
    expect(rows[3]?.monthly).toBe(est.plans.comfort.quote.monthly)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.monthly).toBeLessThan(rows[i - 1]!.monthly)
    }
  })
})
