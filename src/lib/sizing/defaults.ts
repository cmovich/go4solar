import type { SizingSettings } from './types'

/**
 * Mirror of the `sizing` row seeded in supabase/migrations/0001_core.sql.
 * Used by tests and as a fallback when the settings row cannot be read.
 */
export const DEFAULT_SIZING_SETTINGS: SizingSettings = {
  headroom: 1.25,
  powerFactor: 0.8,
  dod: 0.8,
  inverterEfficiency: 0.9,
  panelDerate: 0.75,
  panelWatts: 550,
  nightShare: 0.6,
  backupHours: { essential: 3, comfort: 8 },
  inverterSizesKva: [1, 1.5, 2.5, 3.5, 5, 7.5, 10, 15, 20],
  batteryStepKwh: 2.5,
  pshByState: { FCT: 5.5, Kaduna: 5.8, Lagos: 4.5 },
}
