import 'server-only'

import { z } from 'zod'

import { siteMediaUrl } from '@/lib/content/server'
import { roundNaira } from '@/lib/money'
import { installBandFor } from '@/lib/pricing/tables'
import type { PriceList, PricingSettings } from '@/lib/settings/schemas'
import { equipmentFrom } from '@/lib/sizing/equipment'
import { createAdminClient } from '@/lib/supabase/admin'

import { ACCESSORY_KINDS, RATING_UNITS, type AccessoryKind, type AccessoryRule } from './autopick'
import type { FullCatalogue } from './build'

type Admin = ReturnType<typeof createAdminClient>

const builderSettingsSchema = z.object({
  railsPerPanel: z.number().min(0).max(10),
  clampPricePerPanel: z.number().min(0),
  extraPerStorey: z.number().min(0),
  maxDcVoltageDrop: z.number().gt(0).max(0.2),
})
const DEFAULT_BUILDER_SETTINGS = {
  railsPerPanel: 1,
  clampPricePerPanel: 0,
  extraPerStorey: 0,
  maxDcVoltageDrop: 0.03,
}

const n = (v: unknown) => Number(v ?? 0)

/** Rows of components as the builder needs them (missing columns before 0027 → defaults). */
type ComponentRowAll = {
  sku: string
  name: string
  category: 'panels' | 'battery' | 'inverter' | 'accessories'
  unit_cost: number | string
  stock_sizes: unknown
  active: boolean
  sample: boolean
  nominal_voltage?: number | string | null
  specs?: unknown
  kind?: string | null
  rating?: number | string | null
  unit?: string | null
  brand?: string | null
  description?: string | null
  photo?: string | null
}

const size = (row: ComponentRowAll, key: string) => {
  const v = (row.stock_sizes as Record<string, unknown> | null)?.[key]
  return typeof v === 'number' ? v : null
}
const specsOf = (row: ComponentRowAll) =>
  (row.specs && typeof row.specs === 'object' ? row.specs : {}) as Record<string, number | string>

/**
 * Part F: the catalogue with cost prices (server only). Null before migration 0027 or when a
 * table cannot be read, so quotes keep working as before.
 */
export async function loadCatalogue(
  admin: Admin,
  installByState: PriceList['installByState'],
): Promise<(FullCatalogue & { details: Map<string, ItemDetails> }) | null> {
  const [components, rules, racks, logistics, roofs, settings] = await Promise.all([
    admin.from('components').select('*').eq('active', true),
    admin.from('accessory_rules').select('*').order('max_kva'),
    admin.from('rack_prices').select('material, price_per_cm, sample'),
    admin.from('logistics_costs').select('*'),
    admin.from('roof_types').select('*').eq('active', true),
    admin.from('settings').select('value').eq('key', 'builder').maybeSingle(),
  ])
  for (const r of [components, rules, racks, logistics, roofs]) {
    if (r.error) {
      console.error('[catalogue] not available:', r.error.message)
      return null
    }
  }
  const rows = (components.data ?? []) as ComponentRowAll[]
  const details = new Map<string, ItemDetails>()
  for (const r of rows) {
    details.set(r.sku, {
      brand: r.brand ?? null,
      description: r.description ?? null,
      photoUrl: siteMediaUrl(r.photo ?? null),
    })
  }
  const inverterRows = rows.filter((r) => r.category === 'inverter' && size(r, 'kva') !== null)
  const equipment = equipmentFrom({
    inverters: inverterRows.map((r) => ({
      sku: r.sku,
      kva: size(r, 'kva')!,
      nominalVoltage: r.nominal_voltage == null ? null : n(r.nominal_voltage),
      specs: specsOf(r),
    })),
    panel: { sku: '', watts: 550, specs: {} },
    batteries: [],
  })
  const panels = rows
    .filter((r) => r.category === 'panels' && size(r, 'watts') !== null)
    .map((r) => {
      const opt = equipmentFrom({
        inverters: [],
        panel: { sku: r.sku, watts: size(r, 'watts')!, specs: specsOf(r) },
        batteries: [],
      }).panel
      const len = specsOf(r).lengthCm
      return {
        sku: r.sku,
        name: r.name,
        watts: size(r, 'watts')!,
        unitCost: n(r.unit_cost),
        lengthCm: typeof len === 'number' ? len : null,
        option: opt,
      }
    })
  return {
    details,
    sample:
      (logistics.data ?? []).some((r) => r.sample) || (racks.data ?? []).some((r) => r.sample),
    inverters: inverterRows.map((r, i) => ({
      sku: r.sku,
      name: r.name,
      kva: size(r, 'kva')!,
      unitCost: n(r.unit_cost),
      option: equipment.inverters[i]!,
    })),
    batteries: rows
      .filter((r) => r.category === 'battery' && size(r, 'kwh') !== null)
      .map((r) => ({
        sku: r.sku,
        name: r.name,
        kwh: size(r, 'kwh')!,
        voltage: r.nominal_voltage == null ? null : n(r.nominal_voltage),
        unitCost: n(r.unit_cost),
      })),
    panels,
    accessories: rows
      .filter((r) => r.category === 'accessories')
      .flatMap((r) => {
        const kind = r.kind ?? 'pack'
        if (kind !== 'pack' && !(ACCESSORY_KINDS as readonly string[]).includes(kind)) return []
        const rating = kind === 'pack' ? (size(r, 'maxKva') ?? 0) : n(r.rating)
        return [
          {
            sku: r.sku,
            name: r.name,
            kind: kind as AccessoryKind | 'pack',
            rating,
            unitCost: n(r.unit_cost),
            unit: r.unit === 'metre' ? ('metre' as const) : ('each' as const),
          },
        ]
      }),
    rules: (rules.data ?? []).map((r): AccessoryRule => ({
      maxKva: n(r.max_kva),
      dcBreakerA: n(r.dc_breaker_a),
      acBreakerA: n(r.ac_breaker_a),
      dcSurgeV: n(r.dc_surge_v),
      acSurgeKa: n(r.ac_surge_ka),
      batteryBreakerA: n(r.battery_breaker_a),
      changeoverA: n(r.changeover_a),
      regulatorKva: n(r.regulator_kva),
      boxWays: n(r.box_ways),
      trunkPipeMm: n(r.trunk_pipe_mm),
      flexPipeMm: n(r.flex_pipe_mm),
      acWireMm2: n(r.ac_wire_mm2),
      dcWireMm2: n(r.dc_wire_mm2),
      trunkPipeM: n(r.trunk_pipe_m),
      flexPipeM: n(r.flex_pipe_m),
    })),
    rackPrices: Object.fromEntries(
      (racks.data ?? []).map((r) => [r.material, n(r.price_per_cm)]),
    ) as FullCatalogue['rackPrices'],
    settings:
      builderSettingsSchema.safeParse(settings.data?.value).data ?? DEFAULT_BUILDER_SETTINGS,
    logistics: (logistics.data ?? []).map((r) => ({
      state: r.state,
      amount: n(r.amount),
      extraPerPanel: n(r.extra_per_panel),
      localVendorsAvailable: r.local_vendors_available,
    })),
    installByState,
    roofTypes: (roofs.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      needsRack: r.needs_rack,
      price: n(r.install_price),
      unit: r.install_price_unit === 'per_kw' ? ('per_kw' as const) : ('per_panel' as const),
    })),
  }
}

export type ItemDetails = {
  brand: string | null
  description: string | null
  photoUrl: string | null
}

/** One item as the builder shows it: customer price, never the cost. */
export type BuilderItem = {
  sku: string
  name: string
  group: 'inverter' | 'battery' | 'panels' | 'dc_wire' | 'ac_wire' | 'accessories'
  kind: AccessoryKind | 'pack' | null
  unit: 'each' | 'metre'
  /** e.g. "5 kVA · 48 V", "550 W", "63 A". */
  size: string
  kva: number | null
  kwh: number | null
  watts: number | null
  voltage: number | null
  rating: number | null
  brand: string | null
  description: string | null
  photoUrl: string | null
  /** Customer price per unit (or per metre) at the lowest deposit over 12 months. */
  price: number
}

/**
 * The browser-safe catalogue: each item's customer price (cost with its category margin, priced
 * like a quote at the lowest deposit over 12 months), and no cost prices.
 */
export function toBuilderItems(
  cat: FullCatalogue & { details: Map<string, ItemDetails> },
  pricing: PricingSettings,
  minDepositShare: number,
): BuilderItem[] {
  const f = pricing.pricingRateByTenure[12]
  const factor = 1 / (1 - f * (1 - minDepositShare))
  const price = (cost: number, category: keyof PricingSettings['marginByCategory']) =>
    roundNaira(cost * (1 + pricing.marginByCategory[category]) * factor)
  const d = (sku: string) =>
    cat.details.get(sku) ?? { brand: null, description: null, photoUrl: null }
  const blank = { kva: null, kwh: null, watts: null, voltage: null, rating: null }
  return [
    ...cat.inverters.map((i) => ({
      ...blank,
      sku: i.sku,
      name: i.name,
      group: 'inverter' as const,
      kind: null,
      unit: 'each' as const,
      size: `${i.kva} kVA · ${i.option.batteryV} V`,
      kva: i.kva,
      voltage: i.option.batteryV,
      ...d(i.sku),
      price: price(i.unitCost, 'inverter'),
    })),
    ...cat.batteries.map((b) => ({
      ...blank,
      sku: b.sku,
      name: b.name,
      group: 'battery' as const,
      kind: null,
      unit: 'each' as const,
      size: `${b.kwh} kWh${b.voltage ? ` · ${b.voltage} V` : ''}`,
      kwh: b.kwh,
      voltage: b.voltage,
      ...d(b.sku),
      price: price(b.unitCost, 'battery'),
    })),
    ...cat.panels.map((p) => ({
      ...blank,
      sku: p.sku,
      name: p.name,
      group: 'panels' as const,
      kind: null,
      unit: 'each' as const,
      size: `${p.watts} W`,
      watts: p.watts,
      ...d(p.sku),
      price: price(p.unitCost, 'panels'),
    })),
    ...cat.accessories.map((a) => ({
      ...blank,
      sku: a.sku,
      name: a.name,
      group:
        a.kind === 'dc_wire'
          ? ('dc_wire' as const)
          : a.kind === 'ac_wire'
            ? ('ac_wire' as const)
            : ('accessories' as const),
      kind: a.kind,
      unit: a.unit,
      size:
        a.kind === 'pack'
          ? `up to ${a.rating} kVA`
          : `${a.rating} ${RATING_UNITS[a.kind]}${a.unit === 'metre' ? ' · per metre' : ''}`,
      rating: a.rating,
      ...d(a.sku),
      price: price(a.unitCost, 'accessories'),
    })),
  ]
}

/** Installation band for display ("small" up to 3.5 kVA…), re-exported for the builder. */
export { installBandFor }
