import { describe, expect, it } from 'vitest'

import { makeItem } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadItem } from '@/lib/load/types'

import { DEFAULT_SIZING_SETTINGS, assumedEquipment } from './defaults'
import { LoadEmptyError, LoadTooLargeError, roundUpToStep, sizeSystem, stringLayout } from './size'
import type { Equipment, GridInput, Plan, SizingSettings, SunHours } from './types'

const s: SizingSettings = DEFAULT_SIZING_SETTINGS
const eq: Equipment = assumedEquipment()

// Semako's test home: 2,000 W in all, 1,000 W of it marked essential, everything used 6 h in the
// day (and 6 h at night: only the "typical night use" line depends on it).
const testHome: LoadItem[] = [
  makeItem({
    id: 'ess',
    watts: 1000,
    essential: true,
    dayHours: 6,
    nightHours: 6,
    hoursPerDay: 12,
  }),
  makeItem({ id: 'rest', watts: 1000, dayHours: 6, nightHours: 6, hoursPerDay: 12 }),
]
const home = computeLoadTotals(testHome)

const SUN: Record<'Lagos' | 'Abuja' | 'Kano', SunHours> = {
  Lagos: { annual: 5.09, rainy: 4.46 },
  Abuja: { annual: 5.9, rainy: 4.81 },
  Kano: { annual: 6.63, rainy: 5.95 },
}
const NIGHT_GRID_A: GridInput = { mode: 'A', pattern: 'daily', dayHours: 0, nightHours: 4 }

const size = (plan: Plan, sun: SunHours, grid: GridInput | null = null, settings = s, e = eq) =>
  sizeSystem(home, plan, settings, { sun, grid, equipment: e })

// The table agreed with Semako (27 Oct): battery kWh, panels (±1), inverter kVA, backup.
type Row = [Plan, number, number, number, number]
const TABLE: Record<keyof typeof SUN, { noGrid: Row[]; grid: (Row & unknown[])[] }> = {
  Lagos: {
    noGrid: [
      ['essential', 10, 7, 3.5, 8.1],
      ['comfort', 20, 14, 7.5, 8.1],
      ['independence', 30, 20, 15, 12.2],
    ],
    grid: [
      ['essential', 5, 4, 2.5, 4.0],
      ['comfort', 10, 8, 5, 4.0],
      ['independence', 17.5, 14, 7.5, 7.1],
    ],
  },
  Abuja: {
    noGrid: [
      ['essential', 10, 6, 3.5, 8.1],
      ['comfort', 20, 12, 7.5, 8.1],
      ['independence', 30, 19, 15, 12.2],
    ],
    grid: [
      ['essential', 5, 4, 2.5, 4.0],
      ['comfort', 10, 7, 5, 4.0],
      ['independence', 17.5, 13, 7.5, 7.1],
    ],
  },
  Kano: {
    noGrid: [
      ['essential', 10, 6, 3.5, 8.1],
      ['comfort', 20, 11, 7.5, 8.1],
      ['independence', 30, 15, 10, 12.2],
    ],
    grid: [
      ['essential', 5, 4, 2.5, 4.0],
      ['comfort', 10, 7, 5, 4.0],
      ['independence', 17.5, 10, 5, 7.1],
    ],
  },
}

describe('the three test homes × three plans (agreed table, panels ±1)', () => {
  for (const [state, rows] of Object.entries(TABLE) as [
    keyof typeof SUN,
    (typeof TABLE)['Lagos'],
  ][]) {
    for (const [plan, kwh, panels, kva, backup] of rows.noGrid) {
      it(`${state} · ${plan} · no grid → ${kwh} kWh, ${panels} panels, ${kva} kVA`, () => {
        const r = size(plan, SUN[state])
        expect(r.batteryKwh).toBe(kwh)
        expect(Math.abs(r.panelCount - panels)).toBeLessThanOrEqual(1)
        expect(r.inverterKva).toBe(kva)
        expect(Math.abs(r.backupHoursFullLoad - backup)).toBeLessThanOrEqual(0.1)
        expect(r.backupWithGridHours).toBeNull()
        expect(r.noGridDayBackupHours).toBeNull()
      })
    }
    for (const [plan, kwh, panels, kva, noGridDay] of rows.grid) {
      it(`${state} · ${plan} · 4 h night grid (mode A) → ${kwh} kWh, ${panels} panels, ${kva} kVA`, () => {
        const r = size(plan, SUN[state], NIGHT_GRID_A)
        expect(r.batteryKwh).toBe(kwh)
        expect(Math.abs(r.panelCount - panels)).toBeLessThanOrEqual(1)
        expect(r.inverterKva).toBe(kva)
        expect(Math.abs(r.noGridDayBackupHours! - noGridDay)).toBeLessThanOrEqual(0.1)
      })
    }
  }
})

describe('backup hours', () => {
  it('plan night hours: Essentials and Comfort 8 h, 24-hour the whole 12 h night', () => {
    expect(size('essential', SUN.Lagos).workings!.targetKwh).toBe(8) // 1,000 W essential × 8 h
    expect(size('comfort', SUN.Lagos).workings!.targetKwh).toBe(16) // 2,000 W × 8 h
    expect(size('independence', SUN.Lagos).workings!.targetKwh).toBe(24) // 2,000 W × 12 h
  })

  it('grid only ever makes backup longer or the battery smaller — never shorter', () => {
    for (const plan of ['essential', 'comfort', 'independence'] as const) {
      for (const sun of Object.values(SUN)) {
        const none = size(plan, sun)
        const grid = size(plan, sun, NIGHT_GRID_A)
        expect(grid.batteryKwh).toBeLessThanOrEqual(none.batteryKwh)
        expect(grid.backupWithGridHours!).toBeGreaterThanOrEqual(grid.workings!.planHours)
      }
    }
  })

  it('24-hour with grid lasts all night; on a day with no grid it keeps the 6 h floor', () => {
    const r = size('independence', SUN.Lagos, NIGHT_GRID_A)
    expect(r.backupWithGridHours).toBe(12)
    expect(r.noGridDayBackupHours!).toBeGreaterThanOrEqual(6)
  })

  it('typical night use: the battery against the customer’s own night energy', () => {
    // Comfort Lagos no grid: 20 kWh × 0.81 = 16.2 kWh usable; night use 12 kWh over 12 h = 1 kW.
    expect(size('comfort', SUN.Lagos).realisticBackupHours).toBe(16.2)
  })

  it('no night use → no typical-night figure', () => {
    const dayOnly = computeLoadTotals([
      makeItem({ id: 'a', watts: 500, dayHours: 6, nightHours: 0, hoursPerDay: 6 }),
    ])
    const r = sizeSystem(dayOnly, 'comfort', s, { sun: SUN.Lagos, grid: null, equipment: eq })
    expect(r.realisticBackupHours).toBeNull()
  })

  it('Essentials with nothing marked essential covers every item (with a warning)', () => {
    const none = computeLoadTotals([
      makeItem({ id: 'a', watts: 800, dayHours: 4, nightHours: 4, hoursPerDay: 8 }),
    ])
    const r = sizeSystem(none, 'essential', s, { sun: SUN.Lagos, grid: null, equipment: eq })
    expect(r.workings!.items).toBe('all')
    expect(r.workings!.planLoadW).toBe(800)
    expect(r.warnings!.join(' ')).toMatch(/essential/i)
  })
})

describe('grid supply (Semako’s planner example and every mode)', () => {
  const sizeAt48 = (grid: GridInput | null) => size('independence', SUN.Lagos, grid)

  it('planner example: 24-hour, 2,000 W, Lagos, 4 h night grid, mode A, 48 V → ~15 kWh vs ~30 kWh', () => {
    const withGrid = sizeAt48(NIGHT_GRID_A)
    const without = sizeAt48(null)
    expect(withGrid.batteryV).toBe(48)
    // 24 − 8 bypass − 4 × 40 × 48 × 1.1 × 0.9 × 0.5 (3.8) = 12.2 kWh ÷ 0.81 = 15.1 kWh
    expect(withGrid.workings!.rawBatteryKwh).toBeCloseTo(15.06, 1)
    expect(without.workings!.rawBatteryKwh).toBeCloseTo(29.63, 1)
    expect(withGrid.batteryKwh).toBe(17.5)
    expect(without.batteryKwh).toBe(30)
  })

  it('mode B (charge only): grid charging, no bypass', () => {
    const r = sizeAt48({ ...NIGHT_GRID_A, mode: 'B' })
    expect(r.workings!.bypassKwh).toBe(0)
    expect(r.workings!.gridChargeKwh).toBeCloseTo(3.8, 1)
  })

  it('mode C (supply only): bypass, no grid charging', () => {
    const r = sizeAt48({ ...NIGHT_GRID_A, mode: 'C' })
    expect(r.workings!.bypassKwh).toBe(8)
    expect(r.workings!.gridChargeKwh).toBe(0)
  })

  it('mode D and total blackout: no grid at all', () => {
    const none = sizeAt48(null)
    for (const g of [
      { ...NIGHT_GRID_A, mode: 'D' as const },
      { ...NIGHT_GRID_A, pattern: 'blackout' as const },
    ]) {
      const r = sizeAt48(g)
      expect(r.workings!.grid).toBeNull()
      expect(r.batteryKwh).toBe(none.batteryKwh)
      expect(r.backupWithGridHours).toBeNull()
    }
  })

  it('uncertain: counts 1 h of night grid (setting), no day grid', () => {
    const r = sizeAt48({ mode: 'A', pattern: 'uncertain', dayHours: 6, nightHours: 6 })
    expect(r.workings!.grid).toEqual({ mode: 'A', dayHours: 0, nightHours: 1 })
  })

  it('not every day: uses the hours on the days it comes', () => {
    const r = sizeAt48({ mode: 'A', pattern: 'some_days', dayHours: 0, nightHours: 4 })
    expect(r.workings!.grid).toEqual({ mode: 'A', dayHours: 0, nightHours: 4 })
    expect(r.batteryKwh).toBe(sizeAt48(NIGHT_GRID_A).batteryKwh)
  })

  it('grid confidence scales the stated hours', () => {
    const half = { ...s, grid: { ...s.grid, confidence: 0.5 } }
    const r = size('independence', SUN.Lagos, NIGHT_GRID_A, half)
    expect(r.workings!.grid!.nightHours).toBe(2)
  })

  it('grid charging uses the inverter’s AC charge spec, capped by the setting', () => {
    const low: Equipment = { ...eq, inverters: eq.inverters.map((i) => ({ ...i, acChargeA: 20 })) }
    const r = size('independence', SUN.Lagos, { ...NIGHT_GRID_A, mode: 'B' }, s, low)
    expect(r.workings!.gridChargeKwh).toBeCloseTo((4 * 20 * 48 * 1.1 * 0.9 * 0.5) / 1000, 2)
    expect(r.warnings!.join(' ')).not.toMatch(/AC charge current/)
    const missing = size('independence', SUN.Lagos, { ...NIGHT_GRID_A, mode: 'B' })
    expect(missing.warnings!.join(' ')).toMatch(/AC charge current/)
  })

  it('day grid (modes A and C) reduces the daytime energy the panels supply', () => {
    const dayGrid: GridInput = { mode: 'A', pattern: 'daily', dayHours: 6, nightHours: 0 }
    const r = size('comfort', SUN.Lagos, dayGrid)
    // 12 kWh of day use over a 12 h day = 1 kW; 6 h of day grid takes 6 kWh off.
    expect(r.workings!.dayGridKwh).toBe(6)
    const none = size('comfort', SUN.Lagos)
    expect(r.workings!.kwpNeeded).toBeLessThan(none.workings!.kwpNeeded)
    expect(r.panelCount).toBeLessThanOrEqual(none.panelCount)
    const modeB = size('comfort', SUN.Lagos, { ...dayGrid, mode: 'B' })
    expect(modeB.workings!.dayGridKwh).toBe(0)
  })
})

describe('battery floors', () => {
  it('never below 1 h at full load', () => {
    const tiny = computeLoadTotals([
      makeItem({ id: 'a', watts: 2000, dayHours: 1, nightHours: 0, hoursPerDay: 1 }),
      makeItem({
        id: 'b',
        watts: 100,
        essential: true,
        dayHours: 1,
        nightHours: 1,
        hoursPerDay: 2,
      }),
    ])
    const r = sizeSystem(tiny, 'essential', s, {
      sun: SUN.Lagos,
      grid: NIGHT_GRID_A,
      equipment: eq,
    })
    // 1 h × 2,100 W = 2.1 kWh beats the plan's own need.
    expect(r.workings!.floorKwh).toBeCloseTo(2.1, 5)
    expect(r.batteryKwh).toBe(5) // 2.1 ÷ 0.81 = 2.6 → two 2.5 kWh steps
  })

  it('with grid: the no-grid-day floor (4 h Essentials and Comfort, 6 h 24-hour)', () => {
    expect(size('comfort', SUN.Lagos, NIGHT_GRID_A).workings!.floorKwh).toBe(8) // 2,000 W × 4 h
    expect(size('essential', SUN.Lagos, NIGHT_GRID_A).workings!.floorKwh).toBe(4) // 1,000 W × 4 h
    expect(size('independence', SUN.Lagos, NIGHT_GRID_A).workings!.floorKwh).toBe(12) // 2,000 W × 6 h
  })

  it('at least one battery step', () => {
    expect(roundUpToStep(0.1, 2.5)).toBe(2.5)
    expect(roundUpToStep(10, 2.5)).toBe(10)
    expect(roundUpToStep(10.01, 2.5)).toBe(12.5)
  })
})

describe('inverter: by load first, then up only when the panels or charging need it', () => {
  it('picks by load when the panels fit, with no reason', () => {
    const small = computeLoadTotals([
      makeItem({ id: 'a', watts: 100, dayHours: 2, nightHours: 2, hoursPerDay: 4 }),
    ])
    const r = sizeSystem(small, 'comfort', s, { sun: SUN.Kano, grid: null, equipment: eq })
    expect(r.inverterKva).toBe(1)
    expect(r.inverterReason).toBeNull()
  })

  it('steps up for the panels and says why', () => {
    const r = size('comfort', SUN.Lagos)
    expect(r.workings!.inverterChecks[0]).toMatchObject({ kva: 2.5, ok: false })
    expect(r.inverterReason).toBe(
      `Inverter upsized to 7.5 kVA to connect your ${r.panelCount} panels.`,
    )
  })

  it('load needs at least plan watts ÷ 0.8 (and the surge)', () => {
    const motor = computeLoadTotals([
      makeItem({ id: 'p', watts: 750, surgeFactor: 3, dayHours: 1, nightHours: 0, hoursPerDay: 1 }),
    ])
    // 750 ÷ 0.8 = 938 VA → 1 kVA; surge 750 + 1,500 = 2,250 W > 1 kVA's 1,600 W → bigger.
    const r = sizeSystem(motor, 'comfort', s, { sun: SUN.Kano, grid: null, equipment: eq })
    expect(r.inverterKva).toBeGreaterThan(1)
    expect(r.workings!.inverterChecks[0]!.reason).toMatch(/start/)
  })

  it('battery voltage always matches the inverter', () => {
    for (const plan of ['essential', 'comfort', 'independence'] as const) {
      const r = size(plan, SUN.Abuja)
      const inv = eq.inverters.find((i) => i.kva === r.inverterKva)!
      expect(r.batteryV).toBe(inv.batteryV)
    }
  })

  it('uses real specs over assumed ones', () => {
    const roomy: Equipment = {
      ...eq,
      inverters: eq.inverters.map((i) =>
        i.kva === 2.5
          ? { ...i, batteryV: 48, maxPvW: 9000, maxChargeA: 150, mpptMin: 120, assumed: [] }
          : i,
      ),
    }
    const r = size('comfort', SUN.Lagos, null, s, roomy)
    expect(r.inverterKva).toBe(2.5)
    expect(r.inverterReason).toBeNull()
    expect(r.workings!.assumedSpecs.filter((a) => a.startsWith('INV'))).toEqual([])
  })

  it('too big for every stocked inverter → LoadTooLargeError', () => {
    const huge = computeLoadTotals([
      makeItem({ id: 'h', watts: 10000, qty: 3, dayHours: 1, nightHours: 1, hoursPerDay: 2 }),
    ])
    expect(() =>
      sizeSystem(huge, 'comfort', s, { sun: SUN.Lagos, grid: null, equipment: eq }),
    ).toThrow(LoadTooLargeError)
  })

  it('an empty load → LoadEmptyError', () => {
    expect(() =>
      sizeSystem(computeLoadTotals([]), 'comfort', s, {
        sun: SUN.Lagos,
        grid: null,
        equipment: eq,
      }),
    ).toThrow(LoadEmptyError)
  })
})

describe('panels', () => {
  it('Essentials and Comfort use the yearly sun average (with the rainy-season note); 24-hour the rainy season', () => {
    const c = size('comfort', SUN.Lagos)
    expect(c.workings!.sunSeason).toBe('annual')
    expect(c.workings!.sunHours).toBe(5.09)
    expect(c.rainyNote).toBe(true)
    const i = size('independence', SUN.Lagos)
    expect(i.workings!.sunSeason).toBe('rainy')
    expect(i.workings!.sunHours).toBe(4.46)
    expect(i.rainyNote).toBe(false)
  })

  it('formula: kWp = (day energy + refill ÷ 0.95) ÷ (sun × 0.77), rounded UP to whole panels', () => {
    const r = size('comfort', SUN.Lagos)
    const w = r.workings!
    expect(w.kwpNeeded).toBeCloseTo((12 + 16 / 0.95) / (5.09 * 0.77), 3)
    expect(w.panelsFromEnergy).toBe(Math.ceil((w.kwpNeeded * 1000) / 550))
    expect(r.panelCount).toBeGreaterThanOrEqual(w.panelsFromEnergy)
  })

  it('midday check: panels carry the daytime running load and the charging', () => {
    for (const plan of ['essential', 'comfort', 'independence'] as const) {
      const w = size(plan, SUN.Kano).workings!
      const kw = (size(plan, SUN.Kano).panelCount * 550 * 0.77) / 1000
      expect(kw).toBeGreaterThanOrEqual(w.planLoadW / 1000 + w.refillKwh / 0.95 / w.sunHours - 1e-9)
    }
  })

  it('string layout keeps the string voltage inside the inverter’s limits', () => {
    const inv = eq.inverters.find((i) => i.kva === 5)!
    const layout = stringLayout(10, eq.panel, inv, 1.05)!
    expect(layout.series * layout.strings).toBeGreaterThanOrEqual(10)
    expect(layout.series * 49.6 * 1.05).toBeLessThanOrEqual(inv.maxPvVoc)
    expect(layout.series * 41.6).toBeGreaterThanOrEqual(inv.mpptMin)
    // 3 panels cannot reach a 120 V MPPT minimum… unless 3 in series (124.8 V).
    expect(stringLayout(1, eq.panel, inv, 1.05)!.series).toBe(3)
  })
})

describe('rounding the battery', () => {
  it('rounds UP by default (no shortfall)', () => {
    expect(size('comfort', SUN.Lagos).shortfall).toBeNull()
  })

  it('"allow round-down" rounds to the nearest step and reports the shortfall', () => {
    const down = { ...s, allowRoundDown: true }
    const t = computeLoadTotals([
      makeItem({ id: 'a', watts: 1100, dayHours: 2, nightHours: 4, hoursPerDay: 6 }),
    ])
    const ctx = { sun: SUN.Kano, grid: null, equipment: eq }
    // Comfort: 1.1 kW × 8 h = 8.8 kWh ÷ 0.81 = 10.86 kWh → nearest step 10 (down).
    expect(sizeSystem(t, 'comfort', s, ctx).batteryKwh).toBe(12.5)
    const r = sizeSystem(t, 'comfort', down, ctx)
    expect(r.batteryKwh).toBe(10)
    expect(r.shortfall).toEqual({ kwh: 0.7, hours: 0.64 })
  })

  it('picks from the real battery catalogue at the inverter’s voltage once batteries have specs', () => {
    const withCatalogue: Equipment = {
      ...eq,
      batteries: [
        { sku: 'BAT-5-24', kwh: 5, voltage: 24, usableDod: 0.9, unitCost: 900_000 },
        { sku: 'BAT-5-48', kwh: 5.12, voltage: 48, usableDod: 0.9, unitCost: 1_000_000 },
        { sku: 'BAT-15-48', kwh: 15.36, voltage: 48, usableDod: 0.9, unitCost: 2_100_000 },
      ],
    }
    const r = size('independence', SUN.Lagos, null, s, withCatalogue)
    expect(r.batteryV).toBe(48)
    // 24 kWh ÷ 0.81 → 2 × 15.36 (₦4.2m) beats 6 × 5.12 (₦6m).
    expect(r.battery).toEqual({ sku: 'BAT-15-48', modules: 2, moduleKwh: 15.36 })
    expect(r.batteryKwh).toBeCloseTo(30.72, 2)
  })
})
