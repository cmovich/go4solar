import { z } from 'zod'

import { INCOME_RANGES, type IncomeRangeId } from '@/lib/applications/rules'
import { phoneSchema } from '@/lib/waitlist/schema'

import type { LendingFigures, LendingType } from './figures'

/**
 * A waiting-list profile completed by staff on the phone (pure): the form, what is still missing,
 * and whether the entry may be sent to Trade Lenda. We confirm basic details and the quote only:
 * Trade Lenda collects NIN, BVN, proof of address, CAC etc. on its own platform (Semako, 19 Nov).
 */

/** The same work types and income ranges as the application wizard (carried over as they are). */
export const EMPLOYMENT_TYPES = [
  'employed',
  'self_employed',
  'business_owner',
  'retired',
  'other',
] as const
export const EMPLOYMENT_LABELS: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  employed: 'Employed',
  self_employed: 'Self-employed',
  business_owner: 'Business owner',
  retired: 'Retired',
  other: 'Other',
}
export const INCOME_RANGE_IDS = INCOME_RANGES.map((r) => r.id) as [
  IncomeRangeId,
  ...IncomeRangeId[],
]
export const incomeLabel = (id: string | null) =>
  INCOME_RANGES.find((r) => r.id === id)?.label ?? id ?? null
export const PROFILE_MONTHS = [6, 9, 12] as const

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
/** The profile form (every field optional here; completeness says what is still missing). */
export const profileFormSchema = z.object({
  customerType: z
    .union([z.literal(''), z.enum(['individual', 'business'])])
    .transform((v) => v || null),
  /** Business only: the business name and the contact person's role. */
  businessName: text(120),
  contactRole: text(60),
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
  incomeRange: z.union([z.literal(''), z.enum(INCOME_RANGE_IDS)]).transform((v) => v || null),
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
  customerType: string | null
  businessName: string | null
  contactRole: string | null
  firstName: string | null
  surname: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  dateOfBirth: string | null
  state: string | null
  lga: string | null
  street: string | null
  landmark: string | null
  employmentType: string | null
  incomeRange: string | null
  guarantorName: string | null
  guarantorPhone: string | null
  guarantorRelationship: string | null
  planKind: string | null
  planRef: string | null
  depositShare: number | null
  months: number | null
}

/**
 * Required to send to Trade Lenda: customer type (a business also needs its name and the contact
 * person's role), name, phone, WhatsApp, email, address and the quote. Date of birth, work and
 * income and the guarantor are optional: they never block sending.
 */
const REQUIRED: [keyof ProfileValues, string][] = [
  ['customerType', 'customer type'],
  ['firstName', 'first name'],
  ['surname', 'surname'],
  ['phone', 'phone'],
  ['whatsapp', 'WhatsApp'],
  ['email', 'email'],
  ['state', 'state'],
  ['lga', 'LGA'],
  ['street', 'street address'],
  ['landmark', 'landmark'],
  ['planRef', 'plan'],
  ['depositShare', 'deposit'],
  ['months', 'months'],
]
const BUSINESS_REQUIRED: [keyof ProfileValues, string][] = [
  ['businessName', 'business name'],
  ['contactRole', 'contact person’s role'],
]

export function completeness(v: ProfileValues): { done: number; total: number; missing: string[] } {
  const required = v.customerType === 'business' ? [...REQUIRED, ...BUSINESS_REQUIRED] : REQUIRED
  const missing = required
    .filter(([k]) => v[k] === null || v[k] === '' || v[k] === undefined)
    .map(([, label]) => label)
  return { done: required.length - missing.length, total: required.length, missing }
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
