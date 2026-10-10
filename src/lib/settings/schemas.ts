import { z } from 'zod'

import { DEFAULT_SIZING_SETTINGS } from '@/lib/sizing/defaults'
import type { SizingSettings } from '@/lib/sizing/types'

/** Settings rows are jsonb; these schemas validate them and give safe fallbacks. */

export const sizingSettingsSchema = z.object({
  headroom: z.number().positive(),
  powerFactor: z.number().positive().max(1),
  dod: z.number().positive().max(1),
  inverterEfficiency: z.number().positive().max(1),
  panelDerate: z.number().positive().max(1),
  panelWatts: z.number().positive(),
  backupHours: z.object({
    essential: z.number().positive(),
    comfort: z.number().positive(),
    independence: z.number().positive(),
  }),
  chargeHours: z.number().positive().max(24),
  inverterSizesKva: z.array(z.number().positive()).min(1),
  batteryStepKwh: z.number().positive(),
  // Unused by the sizing engine since the waitlist review; kept for later features.
  nightShare: z.number().min(0).max(1).optional(),
  pshByState: z.record(z.string(), z.number().positive()).optional(),
}) satisfies z.ZodType<SizingSettings>

const costed = {
  sku: z.string().min(1),
  name: z.string().min(1),
  unitCost: z.number().nonnegative(),
}

export const priceListSchema = z.object({
  sample: z.boolean().default(false),
  currency: z.literal('NGN').default('NGN'),
  panel: z.object({ ...costed, watts: z.number().positive() }),
  batteryModule: z.object({ ...costed, kwh: z.number().positive() }),
  inverters: z.array(z.object({ ...costed, kva: z.number().positive() })).min(1),
  accessoriesByKva: z
    .array(z.object({ maxKva: z.number().positive(), unitCost: z.number().nonnegative() }))
    .min(1),
  installByState: z.object({
    FCT: z.number().nonnegative(),
    Kaduna: z.number().nonnegative(),
    Lagos: z.number().nonnegative(),
    Other: z.number().nonnegative(),
  }),
})

export type PriceList = z.infer<typeof priceListSchema>

export const pricingSettingsSchema = z.object({
  sample: z.boolean().default(false),
  pricingRateAnnual: z.number().min(0).max(2),
  marginByCategory: z.object({
    panels: z.number().min(0),
    battery: z.number().min(0),
    inverter: z.number().min(0),
    accessories: z.number().min(0),
  }),
})

export type PricingSettings = z.infer<typeof pricingSettingsSchema>

/** Mirror of the SAMPLE rows seeded in 0003_waitlist.sql (used by tests and as a fallback). */
export const SAMPLE_PRICE_LIST: PriceList = {
  sample: true,
  currency: 'NGN',
  panel: { sku: 'PNL-550', name: '550 W solar panel', watts: 550, unitCost: 120000 },
  batteryModule: {
    sku: 'BAT-2.5',
    name: '2.5 kWh lithium battery module',
    kwh: 2.5,
    unitCost: 450000,
  },
  inverters: [
    { sku: 'INV-1', name: '1 kVA hybrid inverter', kva: 1, unitCost: 180000 },
    { sku: 'INV-1.5', name: '1.5 kVA hybrid inverter', kva: 1.5, unitCost: 220000 },
    { sku: 'INV-2.5', name: '2.5 kVA hybrid inverter', kva: 2.5, unitCost: 350000 },
    { sku: 'INV-3.5', name: '3.5 kVA hybrid inverter', kva: 3.5, unitCost: 450000 },
    { sku: 'INV-5', name: '5 kVA hybrid inverter', kva: 5, unitCost: 650000 },
    { sku: 'INV-7.5', name: '7.5 kVA hybrid inverter', kva: 7.5, unitCost: 950000 },
    { sku: 'INV-10', name: '10 kVA hybrid inverter', kva: 10, unitCost: 1300000 },
    { sku: 'INV-15', name: '15 kVA hybrid inverter', kva: 15, unitCost: 1900000 },
    { sku: 'INV-20', name: '20 kVA hybrid inverter', kva: 20, unitCost: 2500000 },
  ],
  accessoriesByKva: [
    { maxKva: 1.5, unitCost: 60000 },
    { maxKva: 3.5, unitCost: 100000 },
    { maxKva: 7.5, unitCost: 180000 },
    { maxKva: 20, unitCost: 300000 },
  ],
  installByState: { FCT: 150000, Kaduna: 150000, Lagos: 200000, Other: 200000 },
}

export const SAMPLE_PRICING: PricingSettings = {
  sample: true,
  pricingRateAnnual: 0.24,
  marginByCategory: { panels: 0.125, battery: 0.125, inverter: 0.125, accessories: 0.125 },
}

export type QuoteSettings = {
  sizing: SizingSettings
  priceList: PriceList
  pricing: PricingSettings
  minDepositShare: number
  energy: EnergySettings
}

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  sizing: DEFAULT_SIZING_SETTINGS,
  priceList: SAMPLE_PRICE_LIST,
  pricing: SAMPLE_PRICING,
  minDepositShare: 0.2,
  get energy() {
    return DEFAULT_ENERGY_SETTINGS
  },
}

/** Fuel prices, emission factors and grid figures for the energy-spend advice (settings.energy). */
export const energySettingsSchema = z.object({
  /** True while the fuel prices / tariff are placeholder values. */
  sample: z.boolean().default(false),
  fuelPricePerLitre: z.object({ petrol: z.number().positive(), diesel: z.number().positive() }),
  emissionFactorKgPerLitre: z.object({
    petrol: z.number().positive(),
    diesel: z.number().positive(),
  }),
  grid: z.object({
    tariffPerKwh: z.number().positive(),
    factorKgPerKwh: z.number().positive(),
    /** False until the grid factor is confirmed against a published Nigerian figure. */
    verified: z.boolean().default(false),
  }),
})

export type EnergySettings = z.infer<typeof energySettingsSchema>

/** Mirror of the row seeded in 0005_energy.sql. Prices SAMPLE; grid factor UNVERIFIED. */
export const DEFAULT_ENERGY_SETTINGS: EnergySettings = {
  sample: true,
  fuelPricePerLitre: { petrol: 1000, diesel: 1200 },
  emissionFactorKgPerLitre: { petrol: 2.31, diesel: 2.66 },
  grid: { tariffPerKwh: 210, factorKgPerKwh: 0.4, verified: false },
}
