import { z } from 'zod'

import { CATEGORY_IDS, type CategoryId } from '@/lib/load/types'
import { LIMITS } from '@/lib/load/totals'
import { InvalidPhoneError, normalisePhoneNG } from '@/lib/money'

/** Exact consent wording (notes before Prompt 7). Shown on screen and stored with a timestamp. */
export const CONSENT_TEXT =
  'I agree that Go4Solar may contact me by phone, WhatsApp and email about my solar plan, and store my details as described in the Privacy Policy.'

export const ESTIMATE_STATES = ['FCT', 'Kaduna', 'Lagos', 'Other'] as const
export const STATE_LABELS: Record<(typeof ESTIMATE_STATES)[number], string> = {
  FCT: 'Abuja (FCT)',
  Kaduna: 'Kaduna',
  Lagos: 'Lagos',
  Other: 'Other',
}

export const READY_WHEN = ['now', '30_days', 'later'] as const
export const READY_WHEN_LABELS: Record<(typeof READY_WHEN)[number], string> = {
  now: 'Now',
  '30_days': 'Within 30 days',
  later: 'Later',
}

export const ENTRY_CHANNELS = ['phone_call', 'walk_in', 'whatsapp', 'field_visit'] as const
export const ENTRY_CHANNEL_LABELS: Record<(typeof ENTRY_CHANNELS)[number], string> = {
  phone_call: 'Phone call',
  walk_in: 'Walk-in',
  whatsapp: 'WhatsApp',
  field_visit: 'Field visit',
}

/** A Nigerian mobile number in any common format → E.164. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return normalisePhoneNG(value)
    } catch (err) {
      ctx.addIssue({
        code: 'custom',
        message:
          err instanceof InvalidPhoneError
            ? 'Enter a Nigerian mobile number, e.g. 0803 123 4567'
            : 'Invalid phone number',
      })
      return z.NEVER
    }
  })

export const loadItemSchema = z.object({
  id: z.string().min(1),
  category: z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]]),
  name: z.string().min(1).max(80),
  watts: z.number().min(LIMITS.watts.min).max(LIMITS.watts.max),
  qty: z.number().int().min(LIMITS.qty.min).max(LIMITS.qty.max),
  hoursPerDay: z.number().min(LIMITS.hoursPerDay.min).max(LIMITS.hoursPerDay.max),
  surgeFactor: z.number().min(1).max(10),
  dutyCycle: z.number().gt(0).max(1),
  custom: z.boolean(),
})

export const loadItemsSchema = z.array(loadItemSchema).min(1, 'Add at least one appliance').max(200)

// Step 4
export const phoneStepSchema = z.object({
  phone: phoneSchema,
  whatsapp: phoneSchema.optional(),
  sameAsPhone: z.boolean(),
  items: loadItemsSchema,
})

// Step 5
export const emailStepSchema = z.object({
  id: z.uuid(),
  email: z.email('Enter a valid email address'),
})

// Step 6
export const nameStepSchema = z.object({
  id: z.uuid(),
  firstName: z.string().trim().min(2, 'Enter your first name').max(60),
  surname: z.string().trim().min(2, 'Enter your surname').max(60),
  state: z.enum(ESTIMATE_STATES),
  lga: z.string().trim().min(2, 'Enter your local government area').max(80),
  consent: z.literal(true, { error: 'Please tick the box so we can contact you' }),
})

// Step 7
export const planStepSchema = z.object({
  id: z.uuid(),
  plan: z.enum(['essential', 'comfort', 'independence']),
})

// Step 8
export const contributionStepSchema = z.object({
  id: z.uuid(),
  depositShare: z.number().min(0.2).max(0.95),
  readyWhen: z.enum(READY_WHEN),
})

// Installer form
export const installerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  businessName: z.string().trim().max(120).optional(),
  phone: phoneSchema,
  whatsapp: phoneSchema.optional(),
  email: z.email('Enter a valid email address').optional().or(z.literal('')),
  states: z.array(z.enum(ESTIMATE_STATES)).min(1, 'Pick at least one state'),
  lgas: z.string().trim().max(300).optional(),
  yearsInBusiness: z.number().int().min(0).max(80),
  installationsCompleted: z.number().int().min(0).max(100000),
  cacRegistered: z.boolean(),
  consent: z.literal(true, { error: 'Please tick the box so we can contact you' }),
})

export type InstallerInput = z.infer<typeof installerSchema>

/** Staff "add on behalf of customer" form: all the consumer steps in one go. */
export const assistedEntrySchema = z.object({
  items: loadItemsSchema,
  phone: phoneSchema,
  whatsapp: phoneSchema.optional(),
  email: z.email('Enter a valid email address').optional().or(z.literal('')),
  firstName: z.string().trim().min(2).max(60),
  surname: z.string().trim().min(2).max(60),
  state: z.enum(ESTIMATE_STATES),
  lga: z.string().trim().min(2).max(80),
  consent: z.literal(true, { error: 'The customer must have agreed to be contacted' }),
  plan: z.enum(['essential', 'comfort', 'independence']),
  depositShare: z.number().min(0.2).max(0.95),
  readyWhen: z.enum(READY_WHEN),
  entryChannel: z.enum(ENTRY_CHANNELS),
})

export type AssistedEntryInput = z.infer<typeof assistedEntrySchema>

/** Deposit bands used by the admin filters and the PDF summary. */
export const DEPOSIT_BANDS = [
  { id: '20-29', label: '20–29%', min: 0.2, max: 0.3 },
  { id: '30-49', label: '30–49%', min: 0.3, max: 0.5 },
  { id: '50-69', label: '50–69%', min: 0.5, max: 0.7 },
  { id: '70-95', label: '70–95%', min: 0.7, max: 0.951 },
] as const

export function depositBandOf(share: number | null): string | null {
  if (share === null) return null
  return DEPOSIT_BANDS.find((b) => share >= b.min && share < b.max)?.id ?? null
}
