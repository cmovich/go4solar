import { z } from 'zod'

/** Admin forms for the builder catalogue (Part F). */

const amount = z.number().min(0).max(1_000_000_000)
const rating = z.number().positive().max(100000)

export const accessoryRuleSchema = z.object({
  maxKva: z.number().positive().max(100),
  dcBreakerA: rating,
  acBreakerA: rating,
  dcSurgeV: rating,
  acSurgeKa: rating,
  batteryBreakerA: rating,
  changeoverA: rating,
  regulatorKva: rating,
  boxWays: z.number().int().min(2).max(12),
  trunkPipeMm: rating,
  flexPipeMm: rating,
  acWireMm2: rating,
  dcWireMm2: rating,
  trunkPipeM: z.number().min(0).max(1000),
  flexPipeM: z.number().min(0).max(1000),
})
export const accessoryRulesSchema = z
  .array(accessoryRuleSchema)
  .min(1, 'Keep at least one rule')
  .max(30)
  .refine((rows) => new Set(rows.map((r) => r.maxKva)).size === rows.length, {
    message: 'Each rule needs a different "up to kVA".',
  })

export const rackPricesSchema = z.object({ metal: amount, aluminium: amount })

export const builderSettingsSchema = z.object({
  railsPerPanel: z.number().min(0).max(10),
  clampPricePerPanel: amount,
  extraPerStorey: amount,
  maxDcVoltageDrop: z.number().gt(0).max(0.2),
})

export const logisticsRowSchema = z.object({
  state: z.string().min(2).max(40),
  amount,
  extraPerPanel: amount,
  localVendorsAvailable: z.boolean(),
})
export const logisticsSchema = z
  .array(logisticsRowSchema)
  .max(40)
  .refine((rows) => rows.some((r) => r.state === 'Other'), {
    message: 'Keep the "Other" delivery price (it covers every state without its own).',
  })
