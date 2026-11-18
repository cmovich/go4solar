import { z } from 'zod'

import { phoneSchema } from '@/lib/waitlist/schema'

import type { LendingFigures, LendingType } from './figures'

/**
 * A waiting-list profile completed by staff on the phone (pure): the form, what is still missing,
 * and whether the entry may be sent to Trade Lenda. NIN/BVN: only the last 4 digits are kept.
 */

export const EMPLOYMENT_TYPES = [
  'employed',
  'self_employed',
  'business_owner',
  'retired',
  'student',
  'other',
] as const
export const EMPLOYMENT_LABELS: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  employed: 'Employed',
  self_employed: 'Self-employed',
  business_owner: 'Business owner',
  retired: 'Retired',
  student: 'Student',
  other: 'Other',
}
export const INCOME_RANGES = [
  'Under ₦100,000',
  '₦100,000 – ₦250,000',
  '₦250,000 – ₦500,000',
  '₦500,000 – ₦1,000,000',
  'Over ₦1,000,000',
] as const
export const PROFILE_MONTHS = [6, 9, 12] as const

/** The last 4 digits of an 11-digit NIN/BVN, or the 4 digits typed. The full number is dropped. */
export function lastFour(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 11 || digits.length === 4) return digits.slice(-4)
  return null
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
const optionalPhone = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.union([z.null(), phoneSchema]))
const idLast4 = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null
    const l4 = lastFour(v)
    if (!l4) {
      ctx.addIssue({ code: 'custom', message: 'Enter the 11-digit number or its last 4 digits.' })
      return z.NEVER
    }
    return l4
  })

/** The profile form (every field optional here; completeness says what is still missing). */
export const profileFormSchema = z.object({
  firstName: text(60),
  surname: text(60),
  otherNames: text(80),
  dateOfBirth: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.union([z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date of birth.')])),
  email: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.union([z.null(), z.email('Enter a valid email address.')])),
  whatsapp: optionalPhone,
  state: text(40),
  lga: text(80),
  street: text(200),
  landmark: text(200),
  employmentType: z.union([z.literal(''), z.enum(EMPLOYMENT_TYPES)]).transform((v) => v || null),
  employer: text(120),
  jobTitle: text(80),
  incomeRange: z.union([z.literal(''), z.enum(INCOME_RANGES)]).transform((v) => v || null),
  nin: idLast4,
  bvn: idLast4,
  guarantorName: text(120),
  guarantorPhone: optionalPhone,
  guarantorRelationship: text(60),
  guarantorAddress: text(200),
  planKind: z
    .union([z.literal(''), z.enum(['ready', 'builder', 'estimate'])])
    .transform((v) => v || null),
  planRef: text(80),
  depositPct: z
    .number()
    .min(20, 'The deposit is at least 20%.')
    .max(95, 'The deposit is at most 95%.')
    .nullable(),
  months: z.union([z.literal(6), z.literal(9), z.literal(12)]).nullable(),
})
export type ProfileForm = z.output<typeof profileFormSchema>

/** What a complete profile needs (label shown in "Missing: …"). */
export type ProfileValues = {
  firstName: string | null
  surname: string | null
  phone: string | null
  dateOfBirth: string | null
  state: string | null
  lga: string | null
  street: string | null
  landmark: string | null
  employmentType: string | null
  incomeRange: string | null
  ninLast4: string | null
  bvnLast4: string | null
  guarantorName: string | null
  guarantorPhone: string | null
  guarantorRelationship: string | null
  planKind: string | null
  planRef: string | null
  depositShare: number | null
  months: number | null
}

const REQUIRED: [keyof ProfileValues, string][] = [
  ['firstName', 'first name'],
  ['surname', 'surname'],
  ['phone', 'phone'],
  ['dateOfBirth', 'date of birth'],
  ['state', 'state'],
  ['lga', 'LGA'],
  ['street', 'street address'],
  ['landmark', 'landmark'],
  ['employmentType', 'work'],
  ['incomeRange', 'monthly income'],
  ['ninLast4', 'NIN (last 4)'],
  ['bvnLast4', 'BVN (last 4)'],
  ['guarantorName', 'guarantor name'],
  ['guarantorPhone', 'guarantor phone'],
  ['guarantorRelationship', 'guarantor relationship'],
  ['planRef', 'plan'],
  ['depositShare', 'deposit'],
  ['months', 'months'],
]

export function completeness(v: ProfileValues): { done: number; total: number; missing: string[] } {
  const missing = REQUIRED.filter(([k]) => v[k] === null || v[k] === '' || v[k] === undefined).map(
    ([, label]) => label,
  )
  return { done: REQUIRED.length - missing.length, total: REQUIRED.length, missing }
}

export type Ticks = {
  phoneVerifiedAt: string | null
  consentAt: string | null
  figuresAgreedAt: string | null
  /** The figures the customer agreed to (with their lending type). */
  figuresAgreed: LendingFigures | null
}

/**
 * May this entry go into a Trade Lenda batch of this lending type? Complete, verified by phone,
 * consent recorded, and the customer agreed to the figures OF THIS TYPE, still the same now.
 */
export function sendProblems(
  v: ProfileValues,
  t: Ticks,
  lendingType: LendingType,
  current: LendingFigures | null,
): string[] {
  const out: string[] = []
  const c = completeness(v)
  if (c.missing.length > 0) out.push(`Profile incomplete: ${c.missing.join(', ')}.`)
  if (!t.phoneVerifiedAt) out.push('Not verified by phone yet.')
  if (!t.consentAt) out.push('No consent to share with Trade Lenda.')
  if (!t.figuresAgreedAt || !t.figuresAgreed)
    out.push('The customer has not agreed to the figures.')
  else if (t.figuresAgreed.lendingType !== lendingType) {
    out.push('The customer agreed to figures for the other lending type.')
  } else if (
    current &&
    (t.figuresAgreed.totalRepayment !== current.totalRepayment ||
      t.figuresAgreed.monthly !== current.monthly ||
      t.figuresAgreed.deposit !== current.deposit)
  ) {
    out.push('The figures changed since the customer agreed: confirm them again on the phone.')
  }
  return out
}
