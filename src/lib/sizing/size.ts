import type { LoadTotals } from '@/lib/load/types'

import type { Plan, SizingSettings, SystemSize } from './types'

export class LoadEmptyError extends Error {
  constructor() {
    super('Add at least one appliance before sizing a system')
    this.name = 'LoadEmptyError'
  }
}

export class LoadTooLargeError extends Error {
  constructor(
    public readonly requiredKva: number,
    public readonly largestStockedKva: number,
  ) {
    super(
      `This load needs about ${requiredKva.toFixed(1)} kVA; the largest system we offer is ${largestStockedKva} kVA`,
    )
    this.name = 'LoadTooLargeError'
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/** Smallest stocked size ≥ needed, or null when even the largest is too small. */
function pickStockedSize(neededKva: number, stocked: number[]): number | null {
  const sorted = [...stocked].sort((a, b) => a - b)
  return sorted.find((kva) => kva >= neededKva) ?? null
}

/**
 * Round up to a whole number of battery modules, never less than one. The ratio is rounded to
 * 6 dp first so an exact multiple (e.g. 10 / 2.5 = 4.0000000001) is not pushed up a module.
 */
export function roundUpToStep(kwh: number, step: number): number {
  const modules = Math.ceil(Math.round((kwh / step) * 1e6) / 1e6)
  return Math.max(1, modules) * step
}

/**
 * Off-grid sizing (PRD Feature 4 → Sizing logic, as revised in the waitlist review):
 *  - inverter: max(headroom × running, surge) / power factor → next stocked kVA
 *  - battery:  running load × the plan's backup hours, through DoD and inverter efficiency,
 *              rounded up to whole modules (same rule for all three plans)
 *  - panels:   run the load AND refill the battery within the charge window, after derating
 */
export function sizeSystem(totals: LoadTotals, plan: Plan, s: SizingSettings): SystemSize {
  if (totals.runningW <= 0) throw new LoadEmptyError()

  // Inverter: enough for running load with headroom, and for the biggest start-up surge.
  const requiredVa = Math.max(s.headroom * totals.runningW, totals.surgeW) / s.powerFactor
  const requiredKva = requiredVa / 1000
  const inverterKva = pickStockedSize(requiredKva, s.inverterSizesKva)
  if (inverterKva === null) {
    throw new LoadTooLargeError(requiredKva, Math.max(...s.inverterSizesKva))
  }

  // Battery: usable energy = capacity × DoD × inverter efficiency.
  const usableShare = s.dod * s.inverterEfficiency
  const rawBatteryKwh = (totals.runningW * s.backupHours[plan]) / (1000 * usableShare)
  const batteryKwh = roundUpToStep(rawBatteryKwh, s.batteryStepKwh)

  // Panels: carry the running load and put a full battery back in chargeHours of sun.
  const neededKw = (totals.runningW / 1000 + (batteryKwh * s.dod) / s.chargeHours) / s.panelDerate
  const panelCount = Math.ceil(Math.round(((neededKw * 1000) / s.panelWatts) * 1e6) / 1e6)
  const panelKw = (panelCount * s.panelWatts) / 1000

  // Backup: the honest full-load figure and the realistic one from the user's own hours.
  const usableKwh = batteryKwh * usableShare
  const backupHoursFullLoad = round1((usableKwh * 1000) / totals.runningW)
  // No hours entered → no average draw to divide by; the UI shows "—" for null.
  const realisticBackupHours =
    totals.dailyKwh > 0 ? round1(usableKwh / (totals.dailyKwh / 24)) : null

  return { inverterKva, batteryKwh, panelCount, panelKw, backupHoursFullLoad, realisticBackupHours }
}
