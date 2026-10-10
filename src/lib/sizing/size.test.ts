import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'

import { DEFAULT_SIZING_SETTINGS } from './defaults'
import { LoadEmptyError, LoadTooLargeError, sizeSystem } from './size'

const totals = computeLoadTotals(sampleHomeItems) // 480 W running, 780 W surge, 3.72 kWh/day
const s = DEFAULT_SIZING_SETTINGS

describe('sizeSystem — PRD worked example, Lagos', () => {
  it('picks a 1 kVA inverter for every plan (975 VA needed)', () => {
    expect(sizeSystem(totals, 'essential', 'Lagos', s).inverterKva).toBe(1)
    expect(sizeSystem(totals, 'comfort', 'Lagos', s).inverterKva).toBe(1)
    expect(sizeSystem(totals, 'independence', 'Lagos', s).inverterKva).toBe(1)
  })

  it('essential: 3 h backup', () => {
    expect(sizeSystem(totals, 'essential', 'Lagos', s)).toEqual({
      inverterKva: 1,
      batteryKwh: 2.5,
      panelCount: 2,
      panelKw: 1.1,
      backupHoursFullLoad: 3.8,
      realisticBackupHours: 11.6,
    })
  })

  it('comfort: 8 h backup', () => {
    expect(sizeSystem(totals, 'comfort', 'Lagos', s)).toEqual({
      inverterKva: 1,
      batteryKwh: 7.5,
      panelCount: 5,
      panelKw: 2.75,
      backupHoursFullLoad: 11.3,
      realisticBackupHours: 34.8,
    })
  })

  it('independence: battery covers the night from real kWh, not full load', () => {
    expect(sizeSystem(totals, 'independence', 'Lagos', s)).toEqual({
      inverterKva: 1,
      batteryKwh: 5,
      panelCount: 3,
      panelKw: 1.65,
      backupHoursFullLoad: 7.5,
      realisticBackupHours: 23.2,
    })
  })
})

describe('sizeSystem — rules', () => {
  it('sunnier states need fewer panels', () => {
    const lagos = sizeSystem(totals, 'comfort', 'Lagos', s) // PSH 4.5
    const kaduna = sizeSystem(totals, 'comfort', 'Kaduna', s) // PSH 5.8
    expect(kaduna.panelCount).toBeLessThan(lagos.panelCount)
    expect(kaduna.batteryKwh).toBe(lagos.batteryKwh)
  })

  it('rounds the inverter UP to the next stocked size, never down', () => {
    // 1600 W running, no surge → 1.25 × 1600 / 0.8 = 2500 VA → 2.5 kVA exactly, so 2.5 is allowed.
    const exact = computeLoadTotals([
      { ...sampleHomeItems[0]!, id: 'h', watts: 1600, qty: 1, surgeFactor: 1 },
    ])
    expect(sizeSystem(exact, 'essential', 'Lagos', s).inverterKva).toBe(2.5)
    // 1601 W → 2501.6 VA → next stocked size, 3.5.
    const over = computeLoadTotals([
      { ...sampleHomeItems[0]!, id: 'h', watts: 1601, qty: 1, surgeFactor: 1 },
    ])
    expect(sizeSystem(over, 'essential', 'Lagos', s).inverterKva).toBe(3.5)
  })

  it('battery is at least one module even for a tiny load', () => {
    const tiny = computeLoadTotals([{ ...sampleHomeItems[0]!, watts: 5, qty: 1, hoursPerDay: 1 }])
    expect(sizeSystem(tiny, 'essential', 'Lagos', s).batteryKwh).toBe(s.batteryStepKwh)
  })

  it('all items 0 h/day → realisticBackupHours null (never Infinity)', () => {
    const noHours = computeLoadTotals(sampleHomeItems.map((i) => ({ ...i, hoursPerDay: 0 })))
    expect(noHours.dailyKwh).toBe(0)
    const size = sizeSystem(noHours, 'essential', 'Lagos', s)
    expect(size.realisticBackupHours).toBeNull()
    expect(size.backupHoursFullLoad).toBe(3.8)
  })

  it('throws LoadEmptyError when nothing is on the list', () => {
    expect(() => sizeSystem(computeLoadTotals([]), 'essential', 'Lagos', s)).toThrow(LoadEmptyError)
  })

  it('throws LoadTooLargeError above the largest stocked inverter', () => {
    // 20 kVA × 0.8 pf = 16 000 W; 1.25 × 13 000 W = 16 250 VA-equivalent → too large.
    const huge = computeLoadTotals([
      { ...sampleHomeItems[0]!, id: 'big', watts: 10000, qty: 1, surgeFactor: 1 },
      { ...sampleHomeItems[0]!, id: 'big2', watts: 3000, qty: 1, surgeFactor: 1 },
    ])
    expect(() => sizeSystem(huge, 'essential', 'Lagos', s)).toThrow(LoadTooLargeError)
  })
})
