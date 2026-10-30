import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadTotals } from '@/lib/load/types'
import { NG_STATE_IDS } from '@/lib/nigeria/states'
import { priceQuote } from '@/lib/pricing/price'
import { DEFAULT_QUOTE_SETTINGS, SAMPLE_PRICE_LIST } from '@/lib/settings/schemas'

import { LoadTooLargeError } from '@/lib/sizing/size'

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

  it('comfort plan (Part B): 2.5 kVA, 5 kWh (2 modules), 4 panels, priced from the sample list', () => {
    // 480 W × 8 h = 3.84 kWh ÷ 0.81 → 5 kWh. Panels: the midday check (480 W running + charging)
    // needs 4 panels (2.2 kW), more than a 1 or 1.5 kVA inverter connects → 2.5 kVA.
    const c = est.plans.comfort
    expect(c.size).toMatchObject({ inverterKva: 2.5, batteryKwh: 5, panelCount: 4 })
    expect(c.size.inverterReason).toBe('Inverter upsized to 2.5 kVA to connect your 4 panels.')
    const lines = Object.fromEntries(c.quote.lines.map((l) => [l.category, l]))
    expect(lines.panels).toMatchObject({ sku: 'PNL-550', qty: 4, unitCost: 120000 })
    expect(lines.battery).toMatchObject({ sku: 'BAT-2.5', qty: 2, unitCost: 450000 })
    expect(lines.inverter).toMatchObject({ sku: 'INV-2.5', qty: 1, unitCost: 350000 })
    expect(lines.accessories).toMatchObject({ qty: 1, unitCost: 100000 })
    expect(c.quote.installCost).toBe(200000) // Lagos
    // Cost price = 480,000 + 900,000 + 350,000 + 100,000 + 200,000
    expect(c.quote.costPrice).toBe(2030000)
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

  it('independence: 7.5 kWh (3 modules) and 5 panels (whole 12 h night, rainy-season sun)', () => {
    const i = est.plans.independence
    expect(i.size).toMatchObject({ batteryKwh: 7.5, panelCount: 5 })
    expect(i.quote.lines.find((l) => l.category === 'battery')?.qty).toBe(3)
  })

  it('every state can have its own installation price; a state without one uses "Other"', () => {
    expect(buildEstimate(totals, 'FCT', 0.2, s).plans.essential.quote.installCost).toBe(150000)
    expect(buildEstimate(totals, 'Lagos', 0.2, s).plans.essential.quote.installCost).toBe(200000)
    expect(buildEstimate(totals, 'Kano', 0.2, s).plans.essential.quote.installCost).toBe(200000)
    const withKano = {
      ...s,
      priceList: {
        ...s.priceList,
        installByState: {
          ...s.priceList.installByState,
          Kano: { small: 175000, medium: 260000, large: 350000 },
        },
      },
    }
    expect(buildEstimate(totals, 'Kano', 0.2, withKano).plans.essential.quote.installCost).toBe(
      175000,
    )
    expect(buildEstimate(totals, 'Enugu', 0.2, withKano).plans.essential.quote.installCost).toBe(
      200000,
    )
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
    // 3,600 W running ÷ 0.8 = 4.5 kVA → at least 5 kVA; the line is that inverter.
    const kva = e.plans.essential.size.inverterKva
    expect(kva).toBeGreaterThanOrEqual(5)
    const lines = Object.fromEntries(e.plans.essential.quote.lines.map((l) => [l.category, l]))
    expect(lines.inverter).toMatchObject({ sku: `INV-${kva}` })
  })
})

describe('Essentials sizes only the ticked items', () => {
  it('2,000 W home with 1,000 W ticked: Essentials is smaller and cheaper than Comfort', () => {
    const home = computeLoadTotals([
      {
        ...sampleHomeItems[0]!,
        id: 'e',
        qty: 1,
        watts: 1000,
        essential: true,
        dayHours: 6,
        nightHours: 6,
        hoursPerDay: 12,
      },
      {
        ...sampleHomeItems[0]!,
        id: 'r',
        qty: 1,
        watts: 1000,
        essential: false,
        dayHours: 6,
        nightHours: 6,
        hoursPerDay: 12,
      },
    ])
    const e = buildEstimate(home, 'FCT', 0.2, s)
    expect(e.plans.essential.size.batteryKwh).toBeLessThan(e.plans.comfort.size.batteryKwh)
    expect(e.plans.essential.size.panelCount).toBeLessThan(e.plans.comfort.size.panelCount)
    expect(e.plans.essential.quote.systemPrice).toBeLessThan(e.plans.comfort.quote.systemPrice)
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
    // 1–4 items, 50–2,000 W each, any day/night hours, some essential (stays under 20 kVA).
    const count = 1 + Math.floor(rand() * 4)
    return computeLoadTotals(
      Array.from({ length: count }, (_, i) => {
        const dayHours = Math.round(rand() * 12)
        const nightHours = Math.round(rand() * 12)
        return {
          ...sampleHomeItems[0]!,
          id: `r${i}`,
          qty: 1,
          watts: Math.round(50 + rand() * 1950),
          surgeFactor: rand() < 0.3 ? 3 : 1,
          essential: rand() < 0.5,
          dayHours,
          nightHours,
          hoursPerDay: dayHours + nightHours,
        }
      }),
    )
  }

  it('battery, panels and system price never decrease essential → comfort → independence', () => {
    let sized = 0
    let essentialSmaller = 0
    for (let i = 0; i < 300; i++) {
      const t = randomTotals()
      const state = NG_STATE_IDS[Math.floor(rand() * NG_STATE_IDS.length)]!
      const deposit = 0.2 + Math.round(rand() * 75) / 100
      let e
      try {
        e = buildEstimate(t, state, deposit, s)
      } catch (err) {
        // Big all-day, all-night loads can need more solar than any stocked inverter connects.
        if (err instanceof LoadTooLargeError && err.cause === 'solar') continue
        throw err
      }
      sized++
      const [es, co, ind] = [e.plans.essential, e.plans.comfort, e.plans.independence]
      const label = `load ${t.runningW} W / ${t.surgeW} W / ${t.dailyKwh} kWh, ${state}, ${deposit}`
      expect(co.size.batteryKwh, label).toBeGreaterThanOrEqual(es.size.batteryKwh)
      expect(ind.size.batteryKwh, label).toBeGreaterThanOrEqual(co.size.batteryKwh)
      // Solar needed never falls (whole panels can differ by the string layout).
      expect(co.size.workings!.kwpNeeded, label).toBeGreaterThanOrEqual(es.size.workings!.kwpNeeded)
      expect(ind.size.workings!.kwpNeeded, label).toBeGreaterThanOrEqual(
        co.size.workings!.kwpNeeded,
      )
      expect(co.size.inverterKva, label).toBeGreaterThanOrEqual(es.size.inverterKva)
      // Essentials sizes only the ticked items: whenever an unticked item has load, it is smaller.
      if (t.essential.count > 0 && t.essential.runningW < t.runningW) {
        expect(es.size.workings!.planLoadW, label).toBeLessThan(co.size.workings!.planLoadW)
        expect(es.size.workings!.targetKwh, label).toBeLessThan(co.size.workings!.targetKwh)
        expect(es.size.batteryKwh, label).toBeLessThanOrEqual(co.size.batteryKwh)
        expect(es.quote.systemPrice, label).toBeLessThanOrEqual(co.quote.systemPrice)
        essentialSmaller++
      }
      expect(ind.size.inverterKva, label).toBeGreaterThanOrEqual(co.size.inverterKva)
    }
    expect(sized).toBeGreaterThan(200)
    expect(essentialSmaller).toBeGreaterThan(80)
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

describe('monthlyByTenure: offered tenures only', () => {
  it('lists the tenures captured in the estimate, including 18/24 when switched on', () => {
    const withLong = {
      ...s,
      pricing: { ...s.pricing, pricingRateByTenure: { 6: 0.24, 12: 0.24, 24: 0.28 } },
    }
    const est = buildEstimate(totals, 'Lagos', 0.2, withLong)
    const rows = monthlyByTenure(est.plans.comfort, est.pricingRateByTenure)
    expect(rows.map((r) => r.tenureMonths)).toEqual([6, 12, 24])
    expect(rows[2]!.monthly).toBeLessThan(rows[1]!.monthly)
  })
})

describe('settings changes and stored estimates', () => {
  it('a sizing change alters the next estimate but never a stored one', () => {
    const before = buildEstimate(totals, 'Lagos', 0.2, s)
    const stored = structuredClone(before) // what the database holds
    const changed = {
      ...s,
      sizing: {
        ...s.sizing,
        panelDerate: 0.6,
        planNightHours: { ...s.sizing.planNightHours, comfort: 10 },
      },
    }
    const after = buildEstimate(totals, 'Lagos', 0.2, changed)
    // New estimates follow the new settings…
    expect(after.plans.comfort.size.batteryKwh).toBeGreaterThan(
      before.plans.comfort.size.batteryKwh,
    )
    expect(after.plans.comfort.size.panelCount).toBeGreaterThan(
      before.plans.comfort.size.panelCount,
    )
    // …while the stored one, re-priced for the slider, still uses its own snapshot.
    const repriced = repriceEstimate(stored, 'comfort', 0.5)
    expect(repriced.size).toEqual(before.plans.comfort.size)
    expect(repriced.quote.snapshot.lines).toEqual(before.plans.comfort.quote.snapshot.lines)
    expect(stored).toEqual(before)
  })

  it('a price or margin change alters the next estimate but never a stored one', () => {
    const before = buildEstimate(totals, 'Lagos', 0.2, s)
    const dearer = {
      ...s,
      priceList: { ...s.priceList, panel: { ...s.priceList.panel, unitCost: 200000 } },
      pricing: { ...s.pricing, marginByCategory: { ...s.pricing.marginByCategory, panels: 0.3 } },
    }
    const after = buildEstimate(totals, 'Lagos', 0.2, dearer)
    expect(after.plans.comfort.quote.systemPrice).toBeGreaterThan(
      before.plans.comfort.quote.systemPrice,
    )
    expect(repriceEstimate(before, 'comfort', 0.2).quote.systemPrice).toBe(
      before.plans.comfort.quote.systemPrice,
    )
  })
})
