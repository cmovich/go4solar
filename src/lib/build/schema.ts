import { z } from 'zod'

import { NG_STATE_IDS, type NgStateId } from '@/lib/nigeria/states'
import type { SystemSize } from '@/lib/sizing/types'
import { phoneSchema } from '@/lib/waitlist/schema'
import { siteAnswersSchema } from '@/lib/wizard/questions'

/** Part F: what the builder sends to the server. */
export const buildSelectionSchema = z.object({
  scope: z.enum(['complete', 'some']),
  existing: z
    .object({
      brand: z.string().trim().max(80),
      kva: z.number().min(0.1).max(100).nullable(),
      batteryV: z.number().min(6).max(800).nullable(),
    })
    .optional(),
  loadKva: z.number().min(0.1).max(100).nullable().optional(),
  state: z.enum(NG_STATE_IDS as [NgStateId, ...NgStateId[]]),
  items: z
    .array(z.object({ sku: z.string().min(1).max(40), qty: z.number().min(0).max(2000) }))
    .max(60)
    .transform((list) => list.filter((i) => i.qty > 0)),
  site: siteAnswersSchema,
  installer: z.enum(['go4solar', 'own']),
  ownDelivery: z.boolean().optional(),
})
export type BuildSelectionInput = z.infer<typeof buildSelectionSchema>

/** Name and contact for "Submit" (prelaunch) / "Apply" (live). */
export const buildContactSchema = z.object({
  firstName: z.string().trim().min(2, 'Enter your first name').max(60),
  surname: z.string().trim().min(2, 'Enter your surname').max(60),
  phone: phoneSchema,
  email: z.email('Enter a valid email address'),
  lga: z.string().trim().min(2, 'Enter your LGA').max(80),
  consent: z.literal(true, { error: 'Please agree so we can contact you' }),
})

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

/** The system as stored with a builder quote (quotes.system_size). */
export function systemSummary(
  s: {
    inverterKva: number | null
    batteries: { kwh: number; qty: number }[]
    panels: { watts: number; count: number } | null
  },
  usableShare: number,
): SystemSize {
  const batteryKwh = r2(s.batteries.reduce((t, b) => t + b.kwh * b.qty, 0))
  const kva = s.inverterKva ?? 0
  return {
    inverterKva: kva,
    batteryKwh,
    panelCount: s.panels?.count ?? 0,
    panelKw: s.panels ? r2((s.panels.watts * s.panels.count) / 1000) : 0,
    // Battery at the inverter's full rated load: a floor, not a promise.
    backupHoursFullLoad: kva > 0 ? r1((batteryKwh * usableShare) / (kva * 0.8)) : 0,
    realisticBackupHours: null,
  }
}
