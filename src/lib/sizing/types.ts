import type { LaunchState } from '@/config/site'

export type Plan = 'essential' | 'comfort' | 'independence'

export type SizingState = LaunchState

/** Sizing constants. Admin edits these; the seed values live in settings.sizing (0001_core.sql). */
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
  /** Share of daily energy used when there is no sun (independence plan). */
  nightShare: number
  /** Backup hours at full load promised by each plan. */
  backupHours: { essential: number; comfort: number }
  /** Inverter sizes vendors actually stock, ascending. */
  inverterSizesKva: number[]
  /** Battery module size; results round up to a multiple of this. */
  batteryStepKwh: number
  /** Peak sun hours per state. */
  pshByState: Record<SizingState, number>
}

export type SystemSize = {
  inverterKva: number
  batteryKwh: number
  panelCount: number
  panelKw: number
  /** Hours the battery lasts with every item switched on (1 dp). */
  backupHoursFullLoad: number
  /** Hours the battery lasts at the user's real average draw (1 dp). */
  realisticBackupHours: number
}
