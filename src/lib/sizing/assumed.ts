import type { InverterOption, PanelOption } from './types'

/**
 * Typical datasheet values for hybrid inverters, used only where an inverter's own specs are not
 * entered yet (Part B). Every value used from here is listed as "assumed" in admin.
 */
export type AssumedInverter = Omit<InverterOption, 'sku' | 'kva' | 'assumed' | 'acChargeA'>

const ROWS: { kva: number; spec: Omit<AssumedInverter, 'surgeW'> }[] = [
  {
    kva: 1,
    spec: { batteryV: 12, maxPvW: 600, maxPvVoc: 145, mpptMin: 30, mpptMax: 115, maxChargeA: 50 },
  },
  {
    kva: 1.5,
    spec: { batteryV: 12, maxPvW: 1000, maxPvVoc: 145, mpptMin: 30, mpptMax: 115, maxChargeA: 60 },
  },
  {
    kva: 2.5,
    spec: { batteryV: 24, maxPvW: 3000, maxPvVoc: 450, mpptMin: 60, mpptMax: 450, maxChargeA: 80 },
  },
  {
    kva: 3.5,
    spec: { batteryV: 24, maxPvW: 4000, maxPvVoc: 450, mpptMin: 60, mpptMax: 450, maxChargeA: 100 },
  },
  {
    kva: 5,
    spec: {
      batteryV: 48,
      maxPvW: 6000,
      maxPvVoc: 500,
      mpptMin: 120,
      mpptMax: 450,
      maxChargeA: 100,
    },
  },
  {
    kva: 7.5,
    spec: {
      batteryV: 48,
      maxPvW: 8000,
      maxPvVoc: 500,
      mpptMin: 120,
      mpptMax: 450,
      maxChargeA: 150,
    },
  },
  {
    kva: 10,
    spec: {
      batteryV: 48,
      maxPvW: 10000,
      maxPvVoc: 500,
      mpptMin: 120,
      mpptMax: 450,
      maxChargeA: 200,
    },
  },
  {
    kva: 15,
    spec: {
      batteryV: 48,
      maxPvW: 15000,
      maxPvVoc: 500,
      mpptMin: 120,
      mpptMax: 450,
      maxChargeA: 250,
    },
  },
  {
    kva: 20,
    spec: {
      batteryV: 48,
      maxPvW: 20000,
      maxPvVoc: 500,
      mpptMin: 120,
      mpptMax: 450,
      maxChargeA: 300,
    },
  },
]

/** The assumed values for an inverter of this size: the row at or just above it (else the largest). */
export function assumedInverter(kva: number, powerFactor = 0.8): AssumedInverter {
  const row = ROWS.find((r) => r.kva >= kva - 1e-9) ?? ROWS[ROWS.length - 1]!
  // Surge: twice the rated watts, the usual short-time rating.
  return { ...row.spec, surgeW: kva * 1000 * powerFactor * 2 }
}

/** A typical 144-cell panel (550 W class): Voc 49.6 V, Vmp 41.6 V. */
export const ASSUMED_PANEL: Pick<PanelOption, 'voc' | 'vmp'> = { voc: 49.6, vmp: 41.6 }
