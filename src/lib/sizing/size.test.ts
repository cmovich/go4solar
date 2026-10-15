import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadTotals } from '@/lib/load/types'

import { DEFAULT_SIZING_SETTINGS } from './defaults'
import { LoadEmptyError, LoadTooLargeError, sizeSystem } from './size'

const totals = computeLoadTotals(sampleHomeItems) // 480 W running, 780 W surge, 3.72 kWh/day
const s = DEFAULT_SIZING_SETTINGS

/** Second fixture from the review: a bigger home. */
const bigger: LoadTotals = {
  runningW: 2000,
  surgeW: 2000,
  dailyKwh: 18,
  byCategoryW: {
    lighting: 0,
    tv_electronics: 0,
    kitchen: 0,
    cooling: 2000,
    laundry: 0,
    water_outdoor: 0,
    business: 0,
  },
  heavyItems: [],
}

describe('sizeSystem — PRD sample home (480 W, 3.72 kWh/day)', () => {
  it('settings carry hours for all three plans and the charge window', () => {
    expect(s.backupHours).toEqual({ essential: 3, comfort: 8, independence: 15 })
    expect(s.chargeHours).toBe(7)
  })

  it('picks a 1 kVA inverter for every plan (975 VA needed)', () => {
    expect(sizeSystem(totals, 'essential', s).inverterKva).toBe(1)
    expect(sizeSystem(totals, 'comfort', s).inverterKva).toBe(1)
    expect(sizeSystem(totals, 'independence', s).inverterKva).toBe(1)
  })

  it('essential: 3 h at full load', () => {
    expect(sizeSystem(totals, 'essential', s)).toEqual({
      inverterKva: 1,
      batteryKwh: 2.5,
      panelCount: 2,
      panelKw: 1.1,
      backupHoursFullLoad: 3.8,
      realisticBackupHours: 11.6,
    })
  })

  it('comfort: 8 h at full load', () => {
    expect(sizeSystem(totals, 'comfort', s)).toEqual({
      inverterKva: 1,
      batteryKwh: 7.5,
      panelCount: 4,
      panelKw: 2.2,
      backupHoursFullLoad: 11.3,
      realisticBackupHours: 34.8,
    })
  })

  it('independence: 15 h at full load (exactly four modules, no float creep)', () => {
    expect(sizeSystem(totals, 'independence', s)).toEqual({
      inverterKva: 1,
      batteryKwh: 10,
      panelCount: 4,
      panelKw: 2.2,
      backupHoursFullLoad: 15,
      realisticBackupHours: 46.5,
    })
  })
})

describe('sizeSystem — bigger home (2000 W, 18 kWh/day)', () => {
  it.each([
    ['essential', 10, 8],
    ['comfort', 22.5, 12],
    ['independence', 42.5, 17],
  ] as const)('%s: battery %s kWh, %s panels', (plan, batteryKwh, panelCount) => {
    const size = sizeSystem(bigger, plan, s)
    expect(size.batteryKwh).toBe(batteryKwh)
    expect(size.panelCount).toBe(panelCount)
  })
})

describe('sizeSystem — rules', () => {
  it('battery and panels never shrink from essential → comfort → independence', () => {
    const e = sizeSystem(totals, 'essential', s)
    const c = sizeSystem(totals, 'comfort', s)
    const i = sizeSystem(totals, 'independence', s)
    expect(c.batteryKwh).toBeGreaterThanOrEqual(e.batteryKwh)
    expect(i.batteryKwh).toBeGreaterThanOrEqual(c.batteryKwh)
    expect(c.panelCount).toBeGreaterThanOrEqual(e.panelCount)
    expect(i.panelCount).toBeGreaterThanOrEqual(c.panelCount)
  })

  it('rounds the battery UP to whole modules and guards float error at exact multiples', () => {
    // 480 W × 15 h / 720 = 10.000…: must be 10, not 12.5.
    expect(sizeSystem(totals, 'independence', s).batteryKwh).toBe(10)
    // 0.1 + 0.2 style: 3 × 0.1 kWh-ish raw values must not creep past a boundary.
    const tiny: LoadTotals = { ...bigger, runningW: 600, surgeW: 600, dailyKwh: 3 } // 600×3/720 = 2.5 exactly
    expect(sizeSystem(tiny, 'essential', s).batteryKwh).toBe(2.5)
  })

  it('rounds the inverter UP to the next stocked size, never down', () => {
    // 1600 W running, no surge → 1.25 × 1600 / 0.8 = 2500 VA → 2.5 kVA exactly, so 2.5 is allowed.
    const exact = computeLoadTotals([
      { ...sampleHomeItems[0]!, id: 'h', watts: 1600, qty: 1, surgeFactor: 1 },
    ])
    expect(sizeSystem(exact, 'essential', s).inverterKva).toBe(2.5)
    // 1601 W → 2501.6 VA → next stocked size, 3.5.
    const over = computeLoadTotals([
      { ...sampleHomeItems[0]!, id: 'h', watts: 1601, qty: 1, surgeFactor: 1 },
    ])
    expect(sizeSystem(over, 'essential', s).inverterKva).toBe(3.5)
  })

  it('battery is at least one module even for a tiny load', () => {
    const tiny = computeLoadTotals([{ ...sampleHomeItems[0]!, watts: 5, qty: 1, hoursPerDay: 1 }])
    expect(sizeSystem(tiny, 'essential', s).batteryKwh).toBe(s.batteryStepKwh)
  })

  it('all items 0 h/day → realisticBackupHours null (never Infinity)', () => {
    const noHours = computeLoadTotals(sampleHomeItems.map((i) => ({ ...i, hoursPerDay: 0 })))
    expect(noHours.dailyKwh).toBe(0)
    const size = sizeSystem(noHours, 'essential', s)
    expect(size.realisticBackupHours).toBeNull()
    expect(size.backupHoursFullLoad).toBe(3.8)
  })

  it('throws LoadEmptyError when nothing is on the list', () => {
    expect(() => sizeSystem(computeLoadTotals([]), 'essential', s)).toThrow(LoadEmptyError)
  })

  it('throws LoadTooLargeError above the largest stocked inverter', () => {
    const huge = computeLoadTotals([
      { ...sampleHomeItems[0]!, id: 'big', watts: 10000, qty: 1, surgeFactor: 1 },
      { ...sampleHomeItems[0]!, id: 'big2', watts: 3000, qty: 1, surgeFactor: 1 },
    ])
    expect(() => sizeSystem(huge, 'essential', s)).toThrow(LoadTooLargeError)
  })
})
