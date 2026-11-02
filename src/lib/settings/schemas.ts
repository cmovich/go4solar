import { z } from 'zod'

import { DEFAULT_SIZING_SETTINGS } from '@/lib/sizing/defaults'
import type { FullCatalogue } from '@/lib/catalogue/build'
import type { GridInput, SizingSettings } from '@/lib/sizing/types'
import type { WiringSettings } from '@/lib/wizard/questions'

/** Settings rows are jsonb; these schemas validate them and give safe fallbacks. */

const share = z.number().positive().max(1)
const hours = z.number().min(0).max(24)

export const sizingSettingsSchema = z.object({
  powerFactor: share,
  dod: share,
  inverterEfficiency: share,
  refillEfficiency: share,
  panelDerate: share,
  panelWatts: z.number().positive(),
  batteryStepKwh: z.number().positive(),
  nightHours: z.number().positive().max(24),
  planNightHours: z.object({ essential: hours, comfort: hours }),
  minBackupFullLoadHours: hours,
  noGridDayMinHours: z.object({ essential: hours, comfort: hours, independence: hours }),
  grid: z.object({
    acChargeAmps: z.number().positive(),
    chargeVoltageFactor: z.number().positive().max(2),
    chargeEfficiency: share,
    timingFactor: share,
    confidence: z.number().min(0).max(1),
    uncertainNightHours: hours,
  }),
  vocSafetyFactor: z.number().min(1).max(1.5),
  allowRoundDown: z.boolean(),
  nightShare: z.number().min(0).max(1),
}) satisfies z.ZodType<SizingSettings>

/** Grid supply answers stored on a lead or quote (Part B; asked by the wizard in Part E). */
export const gridInputSchema = z.object({
  mode: z.enum(['A', 'B', 'C', 'D']),
  pattern: z.enum(['daily', 'some_days', 'uncertain', 'blackout']),
  dayHours: z.number().min(0).max(24),
  nightHours: z.number().min(0).max(24),
}) satisfies z.ZodType<GridInput>

/** A stored grid value, or null when missing or malformed (sized as no grid). */
export function gridFrom(value: unknown): GridInput | null {
  const parsed = gridInputSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Peak sun hours per state (sun_hours table, SAMPLE until confirmed). */
export const sunHoursSchema = z.object({
  annual: z.number().positive(),
  rainy: z.number().positive(),
})
export type SunHoursByState = Record<string, { annual: number; rainy: number }>

/** Mirror of the Lagos row seeded in 0024, used when a state has no row. */
export const DEFAULT_SUN_HOURS = { annual: 5.09, rainy: 4.46 }

export const SIZE_BANDS = ['small', 'medium', 'large'] as const
export type SizeBand = (typeof SIZE_BANDS)[number]
const installByBandSchema = z.object({
  small: z.number().nonnegative(),
  medium: z.number().nonnegative(),
  large: z.number().nonnegative(),
})
type InstallByBand = z.infer<typeof installByBandSchema>

const costed = {
  sku: z.string().min(1),
  name: z.string().min(1),
  unitCost: z.number().nonnegative(),
}
/** Part A specs carried for the sizing engine (missing on price lists stored before Part B). */
const specced = {
  nominalVoltage: z.number().positive().nullable().optional(),
  specs: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
}

export const priceListSchema = z.object({
  sample: z.boolean().default(false),
  /** Components left out because their specs are incomplete (shown to admin as a note). */
  skipped: z.array(z.object({ sku: z.string(), reason: z.string() })).optional(),
  currency: z.literal('NGN').default('NGN'),
  panel: z.object({ ...costed, ...specced, watts: z.number().positive() }),
  batteryModule: z.object({ ...costed, kwh: z.number().positive() }),
  /** Every active battery: the sizing engine picks from those with complete specs. */
  batteries: z.array(z.object({ ...costed, ...specced, kwh: z.number().positive() })).optional(),
  inverters: z.array(z.object({ ...costed, ...specced, kva: z.number().positive() })).min(1),
  accessoriesByKva: z
    .array(z.object({ maxKva: z.number().positive(), unitCost: z.number().nonnegative() }))
    .min(1),
  /**
   * Installation + logistics per state, per inverter size band. Any state can have its own price;
   * "Other" is required and used for every state without one.
   */
  installByState: z
    .record(z.string(), installByBandSchema)
    .refine((m) => 'Other' in m, 'An "Other" installation price is required')
    .transform((m) => m as Record<string, InstallByBand> & { Other: InstallByBand }),
})

export type PriceList = z.infer<typeof priceListSchema>

export const pricingSettingsSchema = z.object({
  sample: z.boolean().default(false),
  /** The 12-month pricing rate (what the waiting-list estimate uses). */
  pricingRateAnnual: z.number().min(0).max(2),
  /**
   * Pricing rate per tenure = expected funder rate + spread + default buffer. Only tenures that
   * are switched on are present; 12 months always is (estimates are priced at 12).
   */
  pricingRateByTenure: z.object({
    3: z.number().min(0).max(2).optional(),
    6: z.number().min(0).max(2).optional(),
    9: z.number().min(0).max(2).optional(),
    12: z.number().min(0).max(2),
    18: z.number().min(0).max(2).optional(),
    24: z.number().min(0).max(2).optional(),
  }),
  marginByCategory: z.object({
    panels: z.number().min(0),
    battery: z.number().min(0),
    inverter: z.number().min(0),
    accessories: z.number().min(0),
  }),
})

export type PricingSettings = z.infer<typeof pricingSettingsSchema>

/** Mirror of the SAMPLE rows seeded in 0006_pricing.sql (used by tests and as a fallback). */
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
  installByState: {
    FCT: { small: 150000, medium: 225000, large: 300000 },
    Kaduna: { small: 150000, medium: 225000, large: 300000 },
    Lagos: { small: 200000, medium: 300000, large: 400000 },
    Other: { small: 200000, medium: 300000, large: 400000 },
  },
}

export const SAMPLE_PRICING: PricingSettings = {
  sample: true,
  pricingRateAnnual: 0.24,
  pricingRateByTenure: { 3: 0.24, 6: 0.24, 9: 0.24, 12: 0.24 },
  marginByCategory: { panels: 0.125, battery: 0.125, inverter: 0.125, accessories: 0.125 },
}

/** Part F: what auto quotes take from the builder catalogue (server-side, with costs). */
export type EstimateCatalogue = Pick<
  FullCatalogue,
  'accessories' | 'rules' | 'rackPrices' | 'settings' | 'logistics' | 'roofTypes'
> & {
  installByState?: FullCatalogue['installByState']
  /** Length of the quoted panel (specs), for the rack; null until entered. */
  panelLengthCm: number | null
}

export type QuoteSettings = {
  sizing: SizingSettings
  /** Missing before migration 0027 (or in tests): quotes use the price list's pack. */
  catalogue?: EstimateCatalogue
  /** Wire estimate settings (quote questions). */
  wiring?: WiringSettings
  /** Peak sun hours per state; a state without a row uses DEFAULT_SUN_HOURS. */
  sunHours?: SunHoursByState
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
