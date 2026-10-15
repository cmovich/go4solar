export type Plan = 'essential' | 'comfort' | 'independence'

/** Sizing constants. Admin edits these; the seed values live in settings.sizing. */
export type SizingSettings = {
  /** Inverter must carry this × running watts (1.25 = 25% headroom). */
  headroom: number
  /** Watts → VA conversion (0.8). */
  powerFactor: number
  /** Usable depth of discharge of the battery (0.8 lithium). */
  dod: number
  inverterEfficiency: number
  /** Panel output lost to heat, dust and wiring (0.75 = 25% lost). */
  panelDerate: number
  /** Watts of one panel. */
  panelWatts: number
  /** Hours at full running load each plan's battery must cover. */
  backupHours: { essential: number; comfort: number; independence: number }
  /** Hours of good sun in which the panels must run the load AND refill the battery. */
  chargeHours: number
  /** Inverter sizes vendors actually stock, ascending. */
  inverterSizesKva: number[]
  /** Battery module size; results round up to a multiple of this. */
  batteryStepKwh: number
  /**
   * Kept for later (energy dashboard, per-state yield estimates); NOT used by sizeSystem since
   * the waitlist review: panels are sized from the charge window, not from sun hours.
   */
  nightShare?: number
  pshByState?: Record<string, number>
}

export type SystemSize = {
  inverterKva: number
  batteryKwh: number
  panelCount: number
  panelKw: number
  /** Hours the battery lasts with every item switched on (1 dp). */
  backupHoursFullLoad: number
  /** Hours the battery lasts at the user's real average draw (1 dp); null when daily kWh is 0. */
  realisticBackupHours: number | null
}
