import { z } from 'zod'

import { CATEGORY_IDS, type CategoryId } from '@/lib/load/types'
import { SIZE_BANDS, energySettingsSchema, sizingSettingsSchema } from '@/lib/settings/schemas'

/** Zod schemas shared by the pricing forms (client) and their server actions. */

export const COMPONENT_CATEGORIES = ['panels', 'battery', 'inverter', 'accessories'] as const
export const COMPONENT_CATEGORY_LABELS: Record<(typeof COMPONENT_CATEGORIES)[number], string> = {
  panels: 'Panels',
  battery: 'Battery',
  inverter: 'Inverter',
  accessories: 'Accessories',
}
/** Which stock_sizes key each category uses. */
export const SIZE_KEY = {
  panels: 'watts',
  battery: 'kwh',
  inverter: 'kva',
  accessories: 'maxKva',
} as const

export const componentDraftSchema = z.object({
  id: z.uuid().optional(),
  sku: z.string().trim().min(1, 'SKU is required').max(40),
  name: z.string().trim().min(2, 'Name is required').max(120),
  category: z.enum(COMPONENT_CATEGORIES),
  unitCost: z.number().min(0).max(1_000_000_000),
  /** watts (panels), kWh (battery), kVA (inverter) or max kVA (accessories tier). */
  size: z.number().positive('Enter the size'),
  source: z.enum(['oem', 'vendor']),
  active: z.boolean(),
  sample: z.boolean(),
})
export type ComponentDraft = z.infer<typeof componentDraftSchema>
export const componentsSchema = z.array(componentDraftSchema).min(1)

const share = z.number().min(0).max(2)

export const marginsSchema = z.object({
  panels: share,
  battery: share,
  inverter: share,
  accessories: share,
})
export type MarginsDraft = z.infer<typeof marginsSchema>

export const rateRowSchema = z.object({
  tenureMonths: z.union([z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
  expectedFunderRate: share,
  spread: share,
  defaultBuffer: share,
})
export const ratesSchema = z.array(rateRowSchema).length(4)
export type RateDraft = z.infer<typeof rateRowSchema>

export const INSTALL_STATES = ['FCT', 'Kaduna', 'Lagos', 'Other'] as const
export const installationRowSchema = z.object({
  state: z.enum(INSTALL_STATES),
  sizeBand: z.enum(SIZE_BANDS),
  amount: z.number().min(0).max(1_000_000_000),
})
export const installationSchema = z.array(installationRowSchema).length(12)
export type InstallationDraft = z.infer<typeof installationRowSchema>

export const unitCostsSchema = z.object({
  kycPerLoan: z.number().min(0),
  feePerInstalment: z.number().min(0),
  lossProvisionShare: share,
  minNetMarginShare: share,
})
export type UnitCostsDraft = z.infer<typeof unitCostsSchema>

export const lateFeeSchema = z.object({
  /** Share of the overdue amount per day (0.0075 = 0.75%). */
  dailyRate: z.number().min(0).max(0.1),
  /** Cap as a share of the overdue amount (0.25 = 25%). */
  capShare: z.number().min(0).max(5),
})
export type LateFeeDraft = z.infer<typeof lateFeeSchema>

export const energySizingSchema = z.object({
  energy: energySettingsSchema,
  sizing: sizingSettingsSchema,
})
export type EnergySizingDraft = z.infer<typeof energySizingSchema>

export const funderSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['external', 'own_fund']),
  annualRate: share,
  method: z.enum(['flat', 'reducing']),
  upfrontFeeShare: share,
  minAmount: z.number().min(0),
  maxAmount: z.number().min(0).nullable(),
  maxTenure: z.union([z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
  balanceAvailable: z.number().min(0),
  status: z.enum(['active', 'paused']),
})
export type FunderDraft = z.infer<typeof funderSchema>

/** Everything the pricing workbench edits, as one draft object. */
export type PricingDraft = {
  components: ComponentDraft[]
  margins: MarginsDraft
  rates: RateDraft[]
  installation: InstallationDraft[]
  unitCosts: UnitCostsDraft
  lateFee: LateFeeDraft
  energy: EnergySizingDraft['energy']
  sizing: EnergySizingDraft['sizing']
  minDepositShare: number
  /** Which sections still hold SAMPLE rows. */
  sample: {
    components: boolean
    margins: boolean
    rates: boolean
    installation: boolean
    unitCosts: boolean
  }
  funders: (FunderDraft & { id: string; sample: boolean })[]
}

/** Appliance library row (admin edits). */
export const applianceSchema = z.object({
  id: z.uuid().optional(),
  category: z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]]),
  name: z.string().trim().min(2).max(80),
  defaultWatts: z.number().int().min(1).max(10000),
  surgeFactor: z.number().min(1).max(10),
  dutyCycle: z.number().gt(0).max(1),
  defaultHours: z.number().min(0).max(24),
  sort: z.number().int().min(0).max(10000),
  active: z.boolean(),
})
export type ApplianceDraft = z.infer<typeof applianceSchema>
