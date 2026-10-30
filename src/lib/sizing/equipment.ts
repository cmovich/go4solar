import { SPEC_FIELDS, missingSpecs, type Specs } from '@/lib/components/specs'

import { ASSUMED_PANEL, assumedInverter, type AssumedInverter } from './assumed'
import type { BatteryOption, Equipment, InverterOption, PanelOption } from './types'

type InverterRow = { sku: string; kva: number; nominalVoltage: number | null; specs: Specs }
type PanelRow = { sku: string; watts: number; specs: Specs }
type BatteryRow = {
  sku: string
  kwh: number
  unitCost: number
  nominalVoltage: number | null
  specs: Specs
}

const num = (specs: Specs, key: string): number | null => {
  const v = specs[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const label = (key: string) => SPEC_FIELDS.inverter.find((f) => f.key === key)?.label ?? key

const INVERTER_KEYS: (keyof AssumedInverter)[] = [
  'batteryV',
  'maxPvW',
  'maxPvVoc',
  'mpptMin',
  'mpptMax',
  'maxChargeA',
  'surgeW',
]

/**
 * The equipment the sizing engine works with, from the price list: each inverter's own specs,
 * missing ones filled from the assumed table (and listed, so admin knows what to enter); the
 * panel's Voc/Vmp the same way; and the batteries whose specs are complete (the catalogue).
 */
export function equipmentFrom(input: {
  inverters: InverterRow[]
  panel: PanelRow
  batteries: BatteryRow[]
}): Equipment {
  const inverters: InverterOption[] = input.inverters.map((row) => {
    const fallback = assumedInverter(row.kva)
    const assumed: string[] = []
    const values = Object.fromEntries(
      INVERTER_KEYS.map((key) => {
        const own =
          key === 'batteryV' ? (num(row.specs, key) ?? row.nominalVoltage) : num(row.specs, key)
        if (own === null) assumed.push(label(key))
        return [key, own ?? fallback[key]]
      }),
    ) as AssumedInverter
    return {
      sku: row.sku,
      kva: row.kva,
      ...values,
      acChargeA: num(row.specs, 'maxAcChargeA'),
      assumed,
    }
  })

  const pAssumed: string[] = []
  const voc = num(input.panel.specs, 'voc')
  const vmp = num(input.panel.specs, 'vmp')
  if (voc === null) pAssumed.push('Voc')
  if (vmp === null) pAssumed.push('Vmp')
  const panel: PanelOption = {
    sku: input.panel.sku,
    watts: input.panel.watts,
    voc: voc ?? ASSUMED_PANEL.voc,
    vmp: vmp ?? ASSUMED_PANEL.vmp,
    assumed: pAssumed,
  }

  const batteries: BatteryOption[] = input.batteries.flatMap((b) => {
    if (
      b.nominalVoltage === null ||
      missingSpecs({ category: 'battery', nominalVoltage: b.nominalVoltage, specs: b.specs }).length
    )
      return []
    const dod = num(b.specs, 'usableDod')
    return [
      {
        sku: b.sku,
        kwh: num(b.specs, 'capacityKwh') ?? b.kwh,
        voltage: b.nominalVoltage,
        usableDod: dod === null ? null : dod / 100,
        unitCost: b.unitCost,
      },
    ]
  })

  return { inverters, panel, batteries }
}
