import type { SizingSettings } from './types'

/**
 * Mirror of the `sizing` row in settings (0001_core.sql, updated by 0004_waitlist_review.sql).
 * Used by tests and as a fallback when the settings row cannot be read.
 */
export const DEFAULT_SIZING_SETTINGS: SizingSettings = {
  headroom: 1.25,
  powerFactor: 0.8,
  dod: 0.8,
  inverterEfficiency: 0.9,
  panelDerate: 0.75,
  panelWatts: 550,
  backupHours: { essential: 3, comfort: 8, independence: 15 },
  chargeHours: 7,
  inverterSizesKva: [1, 1.5, 2.5, 3.5, 5, 7.5, 10, 15, 20],
  batteryStepKwh: 2.5,
  // Unused by the sizing engine (see SizingSettings); kept for later features.
  nightShare: 0.6,
  pshByState: { FCT: 5.5, Kaduna: 5.8, Lagos: 4.5 },
}
