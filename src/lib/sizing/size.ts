import type { LoadSubset, LoadTotals } from '@/lib/load/types'

import type {
  BatteryOption,
  GridInput,
  InverterOption,
  PanelOption,
  Plan,
  SizingContext,
  SizingSettings,
  SizingWorkings,
  SystemSize,
} from './types'

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
    /** 'load': the running load is too big; 'solar': no stocked inverter connects the panels. */
    public readonly cause: 'load' | 'solar' = 'load',
  ) {
    super(
      cause === 'load'
        ? `This load needs about ${requiredKva.toFixed(1)} kVA; the largest system we offer is ${largestStockedKva} kVA`
        : `This load needs more solar panels than our largest inverter (${largestStockedKva} kVA) can connect`,
    )
    this.name = 'LoadTooLargeError'
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100
/** Ceil that ignores floating-point dust (10 / 2.5 = 4.0000000001 stays 4). */
const ceilSafe = (n: number) => Math.ceil(Math.round(n * 1e6) / 1e6)

/** Round up to a whole number of battery steps, never less than one. */
export function roundUpToStep(kwh: number, step: number): number {
  return Math.max(1, ceilSafe(kwh / step)) * step
}

/** Grid hours that count, after the pattern, mode and confidence (null = no usable grid). */
export function effectiveGrid(g: GridInput | null, s: SizingSettings) {
  if (!g || g.mode === 'D' || g.pattern === 'blackout') return null
  const uncertain = g.pattern === 'uncertain'
  const night = Math.min(
    (uncertain ? s.grid.uncertainNightHours : g.nightHours) * s.grid.confidence,
    s.nightHours,
  )
  const day = Math.min((uncertain ? 0 : g.dayHours) * s.grid.confidence, 24 - s.nightHours)
  if (night <= 0 && day <= 0) return null
  return {
    mode: g.mode,
    dayHours: day,
    nightHours: night,
    /** The home runs on grid while it is on (A, C): saves battery at night, panels by day. */
    supplies: g.mode === 'A' || g.mode === 'C',
    /** Grid refills the battery (A, B). */
    charges: g.mode === 'A' || g.mode === 'B',
  }
}

/**
 * Panels in series per string and strings in parallel for at least `count` panels: each string's
 * Voc (× safety factor) under the inverter's max PV Voc, its Vmp inside the MPPT range. Picks the
 * layout that adds the fewest panels (then the longer string). Null when no string length fits.
 */
export function stringLayout(
  count: number,
  panel: Pick<PanelOption, 'voc' | 'vmp'>,
  inv: Pick<InverterOption, 'maxPvVoc' | 'mpptMin' | 'mpptMax'>,
  vocSafety: number,
): { series: number; strings: number } | null {
  const maxSeries = Math.min(
    Math.floor(inv.maxPvVoc / (panel.voc * vocSafety)),
    Math.floor(inv.mpptMax / panel.vmp),
  )
  const minSeries = Math.max(1, Math.ceil(inv.mpptMin / panel.vmp))
  let best: { series: number; strings: number } | null = null
  for (let series = minSeries; series <= maxSeries; series++) {
    const strings = Math.max(1, Math.ceil(count / series))
    const total = series * strings
    if (!best || total < best.series * best.strings || total === best.series * best.strings)
      best = { series, strings }
  }
  return best
}

type BatteryPick = {
  kwh: number
  usableKwh: number
  battery: { sku: string | null; modules: number; moduleKwh: number }
  shortfall: { kwh: number; hours: number } | null
  warning: string | null
}

function pickBattery(
  needKwh: number,
  voltage: number,
  planLoadKw: number,
  catalogue: BatteryOption[],
  s: SizingSettings,
): BatteryPick {
  const shortfallOf = (usable: number) =>
    usable + 1e-9 < needKwh
      ? { kwh: round2(needKwh - usable), hours: round2((needKwh - usable) / planLoadKw) }
      : null
  const atVoltage = catalogue.filter((b) => b.voltage === voltage)
  if (atVoltage.length > 0) {
    // The real catalogue: the cheapest number of identical modules that covers the need.
    const options = atVoltage.map((b) => {
      const per = b.kwh * (b.usableDod ?? s.dod) * s.inverterEfficiency
      const exact = needKwh / per
      const modules = Math.max(1, s.allowRoundDown ? Math.round(exact) : ceilSafe(exact))
      return { b, modules, per, cost: modules * b.unitCost }
    })
    options.sort((x, y) => x.cost - y.cost || x.modules * x.b.kwh - y.modules * y.b.kwh)
    const o = options[0]!
    const usable = o.modules * o.per
    return {
      kwh: Math.round(o.modules * o.b.kwh * 100) / 100,
      usableKwh: usable,
      battery: { sku: o.b.sku, modules: o.modules, moduleKwh: o.b.kwh },
      shortfall: shortfallOf(usable),
      warning: null,
    }
  }
  const raw = needKwh / (s.dod * s.inverterEfficiency)
  const step = s.batteryStepKwh
  const kwh = s.allowRoundDown
    ? Math.max(1, Math.round(raw / step)) * step
    : roundUpToStep(raw, step)
  const usable = kwh * s.dod * s.inverterEfficiency
  return {
    kwh,
    usableKwh: usable,
    battery: { sku: null, modules: Math.round(kwh / step), moduleKwh: step },
    shortfall: shortfallOf(usable),
    warning:
      catalogue.length > 0
        ? `No battery with complete specs at ${voltage} V: sized in ${step} kWh steps.`
        : null,
  }
}

const REASONS = {
  surge: (kva: number) => `Inverter upsized to ${kva} kVA to start your heaviest appliance.`,
  voltage: (kva: number) => `Inverter upsized to ${kva} kVA to suit the panels' voltage.`,
  pv: (kva: number, panels: number) =>
    `Inverter upsized to ${kva} kVA to connect your ${panels} panels.`,
  charge: (kva: number) =>
    `Inverter upsized to ${kva} kVA so the panels can charge your battery fast enough.`,
} as const

/**
 * Part B sizing for one plan.
 *  - Plan load: Essentials = the essential items, Comfort and 24-hour = every item.
 *  - Battery: the plan's night target (load × 8 h, or × the whole night for 24-hour), less what
 *    the grid supplies (bypass, modes A/C) and refills (modes A/B); never below 1 h at full load
 *    or, with grid, the no-grid-day floor; through DoD and inverter efficiency; rounded up.
 *  - Panels: (day energy − day grid + battery refill ÷ 0.95) ÷ (sun hours × derate), whole panels,
 *    then the midday check and the string layout. 24-hour uses rainy-season sun, others the year.
 *  - Inverter: smallest stocked ≥ plan load ÷ 0.8 that starts the surge; stepped up (no cap) only
 *    when the panels, their voltage or the charging current do not fit, with the reason.
 */
export function sizeSystem(
  totals: LoadTotals,
  plan: Plan,
  s: SizingSettings,
  ctx: SizingContext,
): SystemSize {
  if (totals.runningW <= 0) throw new LoadEmptyError()
  const warnings: string[] = []

  const all: LoadSubset = {
    count: 1,
    runningW: totals.runningW,
    surgeW: totals.surgeW,
    dayKwh: totals.dayKwh,
    nightKwh: totals.nightKwh,
    dayRunningW: totals.dayRunningW,
  }
  let load = all
  let items: SizingWorkings['items'] = 'all'
  if (plan === 'essential') {
    if (totals.essential.count > 0 && totals.essential.runningW > 0) {
      load = totals.essential
      items = 'essential'
    } else {
      warnings.push('No items are marked essential: Essentials is sized for every item.')
    }
  }
  const planLoadKw = load.runningW / 1000
  const fullLoadKw = totals.runningW / 1000
  const planHours = plan === 'independence' ? s.nightHours : s.planNightHours[plan]
  const targetKwh = planLoadKw * planHours
  const grid = effectiveGrid(ctx.grid, s)
  const season = plan === 'independence' ? 'rainy' : 'annual'
  const sunHours = season === 'rainy' ? ctx.sun.rainy : ctx.sun.annual
  const panel = ctx.equipment.panel

  const inverters = [...ctx.equipment.inverters].sort((a, b) => a.kva - b.kva)
  const startIndex = inverters.findIndex((i) => i.kva * 1000 * s.powerFactor >= load.runningW)
  if (startIndex < 0) {
    throw new LoadTooLargeError(
      load.runningW / s.powerFactor / 1000,
      inverters[inverters.length - 1]?.kva ?? 0,
    )
  }

  const checks: SizingWorkings['inverterChecks'] = []
  let firstReason: keyof typeof REASONS | null = null

  for (const inv of inverters.slice(startIndex)) {
    // Night: what the grid takes off the battery.
    const bypassHours = grid?.supplies ? Math.min(grid.nightHours, planHours) : 0
    const bypassKwh = bypassHours * planLoadKw
    const acA = Math.min(inv.acChargeA ?? s.grid.acChargeAmps, s.grid.acChargeAmps)
    const gridChargeKwh = grid?.charges
      ? (grid.nightHours *
          acA *
          inv.batteryV *
          s.grid.chargeVoltageFactor *
          s.grid.chargeEfficiency *
          s.grid.timingFactor) /
        1000
      : 0
    const fromBatteryKwh = Math.max(targetKwh - bypassKwh - gridChargeKwh, 0)
    const floorKwh = Math.max(
      s.minBackupFullLoadHours * fullLoadKw,
      grid ? s.noGridDayMinHours[plan] * planLoadKw : 0,
    )
    const needKwh = Math.max(fromBatteryKwh, floorKwh)
    const bat = pickBattery(needKwh, inv.batteryV, planLoadKw, ctx.equipment.batteries, s)

    // Day: panels run the daytime use (less day grid) and refill the battery.
    const refillKwh = Math.min(bat.usableKwh, fromBatteryKwh)
    const dayWindow = 24 - s.nightHours
    const dayGridKwh = grid?.supplies
      ? Math.min(load.dayKwh, (grid.dayHours * load.dayKwh) / dayWindow)
      : 0
    const kwpNeeded =
      (load.dayKwh - dayGridKwh + refillKwh / s.refillEfficiency) / (sunHours * s.panelDerate)
    const panelsFromEnergy = Math.max(1, ceilSafe((kwpNeeded * 1000) / panel.watts))
    const chargeKw = refillKwh / s.refillEfficiency / sunHours
    let n = panelsFromEnergy
    while ((n * panel.watts * s.panelDerate) / 1000 + 1e-9 < load.dayRunningW / 1000 + chargeKw) n++
    const panelsAfterMidday = n
    const layout = stringLayout(n, panel, inv, s.vocSafetyFactor)

    let reason: keyof typeof REASONS | null = null
    if (load.surgeW > inv.surgeW) reason = 'surge'
    else if (!layout) reason = 'voltage'
    else if (layout.series * layout.strings * panel.watts > inv.maxPvW) reason = 'pv'
    else if (chargeKw * 1000 > inv.maxChargeA * inv.batteryV) reason = 'charge'

    const panelCount = layout ? layout.series * layout.strings : n
    checks.push({
      kva: inv.kva,
      ok: reason === null,
      reason:
        reason === null
          ? null
          : reason === 'pv'
            ? `${panelCount} panels (${((panelCount * panel.watts) / 1000).toFixed(2)} kW) exceed its ${inv.maxPvW / 1000} kW PV input`
            : reason === 'surge'
              ? `cannot start the ${Math.round(load.surgeW)} W surge (max ${inv.surgeW} W)`
              : reason === 'voltage'
                ? "the panels' string voltage does not fit its MPPT range"
                : `charging needs ${(chargeKw * 1000).toFixed(0)} W, more than ${inv.maxChargeA} A × ${inv.batteryV} V`,
    })
    if (reason) {
      firstReason ??= reason
      continue
    }

    if (inv.acChargeA === null && grid?.charges) {
      warnings.push(
        `AC charge current not in the ${inv.kva} kVA inverter's specs: ${s.grid.acChargeAmps} A assumed.`,
      )
    }
    if (bat.warning) warnings.push(bat.warning)

    const usable = bat.usableKwh
    const backupHoursFullLoad = round1(usable / planLoadKw)
    const avgNightKw = load.nightKwh / s.nightHours
    const assumedSpecs = [
      ...inv.assumed.map((k) => `${inv.sku}: ${k}`),
      ...panel.assumed.map((k) => `${panel.sku}: ${k}`),
    ]
    const workings: SizingWorkings = {
      plan,
      items,
      nightHours: s.nightHours,
      planLoadW: load.runningW,
      fullLoadW: totals.runningW,
      surgeW: load.surgeW,
      planHours,
      targetKwh: round2(targetKwh),
      nightEnergyKwh: load.nightKwh,
      grid: grid ? { mode: grid.mode, dayHours: grid.dayHours, nightHours: grid.nightHours } : null,
      bypassKwh: round2(bypassKwh),
      gridChargeKwh: round2(gridChargeKwh),
      fromBatteryKwh: round2(fromBatteryKwh),
      floorKwh: round2(floorKwh),
      needKwh: round2(needKwh),
      rawBatteryKwh: round2(needKwh / (s.dod * s.inverterEfficiency)),
      usableKwh: round2(usable),
      dayKwh: load.dayKwh,
      dayGridKwh: round2(dayGridKwh),
      refillKwh: round2(refillKwh),
      sunSeason: season,
      sunHours,
      kwpNeeded: Math.round(kwpNeeded * 1000) / 1000,
      panelsFromEnergy,
      panelsAfterMidday,
      inverterChecks: checks,
      assumedSpecs,
    }
    return {
      version: 2,
      inverterKva: inv.kva,
      inverterSku: inv.sku,
      batteryV: inv.batteryV,
      inverterReason: firstReason ? REASONS[firstReason](inv.kva, panelCount) : null,
      batteryKwh: bat.kwh,
      battery: bat.battery,
      panelCount,
      panelKw: round2((panelCount * panel.watts) / 1000),
      panelWatts: panel.watts,
      stringLayout: layout!,
      backupHoursFullLoad,
      // Never more than the night: beyond it the battery simply lasts all night.
      realisticBackupHours:
        avgNightKw > 0 ? Math.min(s.nightHours, round1(usable / avgNightKw)) : null,
      backupWithGridHours: grid
        ? Math.min(s.nightHours, round1(bypassHours + (usable + gridChargeKwh) / planLoadKw))
        : null,
      noGridDayBackupHours: grid ? backupHoursFullLoad : null,
      shortfall: bat.shortfall,
      rainyNote: season === 'annual',
      warnings,
      workings,
    }
  }

  throw new LoadTooLargeError(
    load.runningW / s.powerFactor / 1000,
    inverters[inverters.length - 1]?.kva ?? 0,
    'solar',
  )
}
