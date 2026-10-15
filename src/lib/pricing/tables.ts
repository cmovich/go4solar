import type { PriceList, PricingSettings, SizeBand } from '@/lib/settings/schemas'

import type { ComponentCategory, TenureMonths } from './types'

/** The pricing tables as the app reads them (numeric columns already numbers). */
export type ComponentRow = {
  sku: string
  name: string
  category: ComponentCategory
  unit_cost: number
  stock_sizes: unknown
  active: boolean
  sample: boolean
}
export type CategoryMarginRow = { category: ComponentCategory; margin: number; sample: boolean }
export type PricingRateRow = {
  tenure_months: number
  expected_funder_rate: number
  spread: number
  default_buffer: number
  pricing_rate: number | null
  sample: boolean
}
export type InstallationCostRow = {
  state: string
  size_band: SizeBand
  amount: number
  sample: boolean
}

/** Installation size band from the inverter: small ≤ 3.5 kVA, medium ≤ 7.5 kVA, large above. */
export function installBandFor(inverterKva: number): SizeBand {
  if (inverterKva <= 3.5) return 'small'
  if (inverterKva <= 7.5) return 'medium'
  return 'large'
}

function sizeOf(row: ComponentRow, key: 'watts' | 'kwh' | 'kva' | 'maxKva'): number | null {
  const sizes = row.stock_sizes
  if (typeof sizes !== 'object' || sizes === null) return null
  const v = (sizes as Record<string, unknown>)[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

const STATES = ['FCT', 'Kaduna', 'Lagos', 'Other'] as const
const BANDS: readonly SizeBand[] = ['small', 'medium', 'large']

/**
 * Build the in-memory price list the estimate engine uses from the pricing tables.
 * Picks the active panel whose wattage matches the sizing setting (else the first active panel),
 * the first active battery module, every active inverter and accessories tier.
 */
export function priceListFromRows(input: {
  components: ComponentRow[]
  installs: InstallationCostRow[]
  panelWatts: number
}): PriceList {
  const active = input.components.filter((c) => c.active)
  const panels = active.filter((c) => c.category === 'panels')
  const panel = panels.find((p) => sizeOf(p, 'watts') === input.panelWatts) ?? panels[0]
  const battery = active.find((c) => c.category === 'battery')
  const inverters = active
    .filter((c) => c.category === 'inverter' && sizeOf(c, 'kva') !== null)
    .sort((a, b) => sizeOf(a, 'kva')! - sizeOf(b, 'kva')!)
  const accessories = active
    .filter((c) => c.category === 'accessories' && sizeOf(c, 'maxKva') !== null)
    .sort((a, b) => sizeOf(a, 'maxKva')! - sizeOf(b, 'maxKva')!)

  if (!panel) throw new Error('No active panels component in the price list')
  if (!battery) throw new Error('No active battery component in the price list')
  if (inverters.length === 0) throw new Error('No active inverter components in the price list')
  if (accessories.length === 0) throw new Error('No active accessories tier in the price list')

  const installByState = Object.fromEntries(
    STATES.map((state) => [
      state,
      Object.fromEntries(
        BANDS.map((band) => {
          const row = input.installs.find((r) => r.state === state && r.size_band === band)
          if (!row) throw new Error(`No installation cost for ${state} / ${band}`)
          return [band, Number(row.amount)]
        }),
      ),
    ]),
  ) as PriceList['installByState']

  const used = [panel, battery, ...inverters, ...accessories]
  return {
    sample: used.some((c) => c.sample) || input.installs.some((r) => r.sample),
    currency: 'NGN',
    panel: {
      sku: panel.sku,
      name: panel.name,
      watts: sizeOf(panel, 'watts') ?? input.panelWatts,
      unitCost: Number(panel.unit_cost),
    },
    batteryModule: {
      sku: battery.sku,
      name: battery.name,
      kwh: sizeOf(battery, 'kwh') ?? 2.5,
      unitCost: Number(battery.unit_cost),
    },
    inverters: inverters.map((i) => ({
      sku: i.sku,
      name: i.name,
      kva: sizeOf(i, 'kva')!,
      unitCost: Number(i.unit_cost),
    })),
    accessoriesByKva: accessories.map((a) => ({
      maxKva: sizeOf(a, 'maxKva')!,
      unitCost: Number(a.unit_cost),
    })),
    installByState,
  }
}

/** Margins per category and the pricing rate per tenure (expected funder + spread + buffer). */
export function pricingFromRows(input: {
  margins: CategoryMarginRow[]
  rates: PricingRateRow[]
}): PricingSettings {
  const margin = (c: ComponentCategory) => {
    const row = input.margins.find((m) => m.category === c)
    if (!row) throw new Error(`No margin for category ${c}`)
    return Number(row.margin)
  }
  const rateFor = (t: TenureMonths) => {
    const row = input.rates.find((r) => r.tenure_months === t)
    if (!row) throw new Error(`No pricing rate for ${t} months`)
    return row.pricing_rate !== null
      ? Number(row.pricing_rate)
      : Number(row.expected_funder_rate) + Number(row.spread) + Number(row.default_buffer)
  }
  const pricingRateByTenure = { 3: rateFor(3), 6: rateFor(6), 9: rateFor(9), 12: rateFor(12) }
  return {
    sample: input.margins.some((m) => m.sample) || input.rates.some((r) => r.sample),
    marginByCategory: {
      panels: margin('panels'),
      battery: margin('battery'),
      inverter: margin('inverter'),
      accessories: margin('accessories'),
    },
    pricingRateByTenure,
    pricingRateAnnual: pricingRateByTenure[12],
  }
}
