import { ASSUMED_PANEL, assumedInverter } from './assumed'
import type { Equipment, SizingSettings } from './types'

/**
 * Mirror of the `sizing` row in settings (updated by migration 0024 for Part B).
 * Used by tests and as a fallback when the settings row cannot be read.
 */
export const DEFAULT_SIZING_SETTINGS: SizingSettings = {
  powerFactor: 0.8,
  dod: 0.9,
  inverterEfficiency: 0.9,
  refillEfficiency: 0.95,
  panelDerate: 0.77,
  panelWatts: 550,
  batteryStepKwh: 2.5,
  nightHours: 12,
  planNightHours: { essential: 8, comfort: 8 },
  minBackupFullLoadHours: 1,
  noGridDayMinHours: { essential: 4, comfort: 4, independence: 6 },
  grid: {
    acChargeAmps: 40,
    chargeVoltageFactor: 1.1,
    chargeEfficiency: 0.9,
    timingFactor: 0.5,
    confidence: 1,
    uncertainNightHours: 1,
  },
  vocSafetyFactor: 1.05,
  allowRoundDown: false,
  nightShare: 0.6,
}

/** Stocked inverter sizes before the catalogue is read (tests, fallbacks). */
export const DEFAULT_INVERTER_SIZES_KVA = [1, 1.5, 2.5, 3.5, 5, 7.5, 10, 15, 20]

/** Equipment with every spec assumed: the fallback when the price list has no specs. */
export function assumedEquipment(
  sizesKva: number[] = DEFAULT_INVERTER_SIZES_KVA,
  panelWatts = DEFAULT_SIZING_SETTINGS.panelWatts,
): Equipment {
  return {
    inverters: sizesKva.map((kva) => ({
      sku: `INV-${kva}`,
      kva,
      ...assumedInverter(kva),
      acChargeA: null,
      assumed: ['all specs'],
    })),
    panel: {
      sku: `PNL-${panelWatts}`,
      watts: panelWatts,
      ...ASSUMED_PANEL,
      assumed: ['Voc', 'Vmp'],
    },
    batteries: [],
  }
}
