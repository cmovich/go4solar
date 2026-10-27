export type Plan = 'essential' | 'comfort' | 'independence'

/**
 * Sizing constants (Part B). Admin edits these in /admin/pricing → Energy & sizing; the seed
 * values live in settings.sizing (migration 0024) and are mirrored in defaults.ts.
 */
export type SizingSettings = {
  /** Inverter: smallest stocked size with kVA × 1000 × this ≥ the plan's running watts (0.8). */
  powerFactor: number
  /** Usable depth of discharge of the battery (0.9 LiFePO4), unless a battery's specs say otherwise. */
  dod: number
  inverterEfficiency: number
  /** Losses putting energy back into the battery (0.95). */
  refillEfficiency: number
  /** Panel output lost to heat, dust and wiring (0.77 = 23% lost). */
  panelDerate: number
  /** Panel used when the price list has none (W). */
  panelWatts: number
  /** Battery step when batteries have no specs yet; results round to a multiple of this. */
  batteryStepKwh: number
  /** Length of the night (no sun), hours: 24-hour plans cover all of it (12). */
  nightHours: number
  /** Night backup hours of the other plans, with no grid: Essentials (essential items) and Comfort. */
  planNightHours: { essential: number; comfort: number }
  /** The battery never goes below this many hours at full load (all items on). */
  minBackupFullLoadHours: number
  /** When grid shrinks the battery: least backup (plan load) on a day the grid does not come. */
  noGridDayMinHours: Record<Plan, number>
  grid: {
    /** Grid charging current used when an inverter has no AC charge spec, and the cap (A). */
    acChargeAmps: number
    /** Charging voltage as a multiple of the battery's nominal voltage (1.1). */
    chargeVoltageFactor: number
    chargeEfficiency: number
    /** Share of grid hours that actually charge (grid often comes when the battery is full). */
    timingFactor: number
    /** How much of the hours a customer states we count on (1 = all). */
    confidence: number
    /** Night grid hours assumed when the customer "can't be certain". */
    uncertainNightHours: number
  }
  /** Panel Voc × this per panel in a string must stay under the inverter's max PV Voc (1.05). */
  vocSafetyFactor: number
  /** Battery may round DOWN to the nearest step; the shortfall is shown on the plan. */
  allowRoundDown: boolean
  /** Items saved before Part B (one "hours per day") count this share of their hours as night. */
  nightShare: number
}

/** Grid supply at the customer's site (Part B; asked by the quote wizard in Part E). */
export type GridMode = 'A' | 'B' | 'C' | 'D'
export const GRID_MODES: readonly GridMode[] = ['A', 'B', 'C', 'D']
export type GridPattern = 'daily' | 'some_days' | 'uncertain' | 'blackout'
export const GRID_PATTERNS: readonly GridPattern[] = ['daily', 'some_days', 'uncertain', 'blackout']
export type GridInput = {
  /** A charge + bypass · B charge only · C supply only · D no grid. */
  mode: GridMode
  pattern: GridPattern
  /** Daytime grid hours (on the days it comes). */
  dayHours: number
  /** Night-time grid hours (on the days it comes). */
  nightHours: number
}

/** One stocked inverter with the specs sizing needs (missing specs filled from assumed.ts). */
export type InverterOption = {
  sku: string
  kva: number
  batteryV: number
  maxPvW: number
  maxPvVoc: number
  mpptMin: number
  mpptMax: number
  /** Solar (PV) charging current to the battery, A. */
  maxChargeA: number
  /** Grid (AC) charging current, A; null = not in the specs (the setting is used, with a warning). */
  acChargeA: number | null
  surgeW: number
  /** Spec keys that were not entered and come from the assumed table. */
  assumed: string[]
}
export type PanelOption = {
  sku: string
  watts: number
  voc: number
  vmp: number
  assumed: string[]
}
/** A battery with complete specs (the catalogue). Without any, sizing uses batteryStepKwh. */
export type BatteryOption = {
  sku: string
  kwh: number
  voltage: number
  /** Usable depth of discharge, 0–1 (null = the dod setting). */
  usableDod: number | null
  unitCost: number
}
export type Equipment = {
  inverters: InverterOption[]
  panel: PanelOption
  batteries: BatteryOption[]
}

/** Peak sun hours of the installation state (yearly average and rainy season). */
export type SunHours = { annual: number; rainy: number }

export type SizingContext = { sun: SunHours; grid: GridInput | null; equipment: Equipment }

/** Every number behind a sizing, for the admin "How this was sized" panel. */
export type SizingWorkings = {
  plan: Plan
  /** Items the plan covers: all, or the essential ones. */
  items: 'all' | 'essential'
  /** The night-hours setting at the time. */
  nightHours: number
  planLoadW: number
  fullLoadW: number
  surgeW: number
  planHours: number
  targetKwh: number
  nightEnergyKwh: number
  grid: { mode: GridMode; dayHours: number; nightHours: number } | null
  bypassKwh: number
  gridChargeKwh: number
  fromBatteryKwh: number
  floorKwh: number
  needKwh: number
  rawBatteryKwh: number
  usableKwh: number
  dayKwh: number
  dayGridKwh: number
  refillKwh: number
  sunSeason: 'annual' | 'rainy'
  sunHours: number
  kwpNeeded: number
  panelsFromEnergy: number
  panelsAfterMidday: number
  inverterChecks: { kva: number; ok: boolean; reason: string | null }[]
  assumedSpecs: string[]
}

export type SystemSize = {
  inverterKva: number
  batteryKwh: number
  panelCount: number
  panelKw: number
  /** Hours the battery lasts with the plan's items all on and no grid (1 dp). */
  backupHoursFullLoad: number
  /** Hours the battery lasts at the customer's typical night use (1 dp); null when no night use. */
  realisticBackupHours: number | null
  // ---- Part B (missing on estimates stored before it) ----
  version?: 2
  inverterSku?: string
  /** Battery (and inverter) voltage. */
  batteryV?: number
  /** Why the inverter is bigger than the load needs, in plain words (null = sized by load). */
  inverterReason?: string | null
  battery?: { sku: string | null; modules: number; moduleKwh: number }
  panelWatts?: number
  stringLayout?: { series: number; strings: number }
  /** Night backup with grid as the customer described it (null = no grid). */
  backupWithGridHours?: number | null
  /** Backup on a day the grid does not come (null = no grid in the quote). */
  noGridDayBackupHours?: number | null
  /** Set when the battery was rounded down (allowRoundDown). */
  shortfall?: { kwh: number; hours: number } | null
  /** Essentials and Comfort use the yearly sun average: say cloudy days give less backup. */
  rainyNote?: boolean
  warnings?: string[]
  workings?: SizingWorkings
}
