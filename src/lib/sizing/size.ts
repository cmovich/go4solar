import type { LoadTotals } from '@/lib/load/types'

import type { Plan, SizingSettings, SizingState, SystemSize } from './types'

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

/** Round up to a whole number of battery modules, never less than one. */
function roundUpToStep(kwh: number, step: number): number {
  return Math.max(1, Math.ceil(kwh / step - 1e-9)) * step
}

/**
 * Standard off-grid sizing (PRD Feature 4 → Sizing logic).
 * Essential/comfort size the battery for N hours at full load; independence sizes it for the
 * night share of the user's real daily energy, so a 24-hour quote stays affordable.
 */
export function sizeSystem(
  totals: LoadTotals,
  plan: Plan,
  state: SizingState,
  s: SizingSettings,
): SystemSize {
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
  const rawBatteryKwh =
    plan === 'independence'
      ? (totals.dailyKwh * s.nightShare) / usableShare
      : (totals.runningW * s.backupHours[plan]) / (1000 * usableShare)
  const batteryKwh = roundUpToStep(rawBatteryKwh, s.batteryStepKwh)

  // Panels: daytime energy plus a full battery recharge, after derating.
  const psh = s.pshByState[state]
  const harvestPerKw = psh * s.panelDerate
  const neededKw =
    plan === 'independence'
      ? totals.dailyKwh / harvestPerKw
      : (totals.dailyKwh * (1 - s.nightShare) + batteryKwh * s.dod) / harvestPerKw
  const panelCount = Math.ceil((neededKw * 1000) / s.panelWatts - 1e-9)
  const panelKw = (panelCount * s.panelWatts) / 1000

  // Backup: the honest full-load figure and the realistic one from the user's own hours.
  const usableKwh = batteryKwh * usableShare
  const backupHoursFullLoad = round1((usableKwh * 1000) / totals.runningW)
  // No hours entered → no average draw to divide by; the UI shows "—" for null.
  const realisticBackupHours =
    totals.dailyKwh > 0 ? round1(usableKwh / (totals.dailyKwh / 24)) : null

  return { inverterKva, batteryKwh, panelCount, panelKw, backupHoursFullLoad, realisticBackupHours }
}
