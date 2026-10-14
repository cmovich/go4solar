import { z } from 'zod'

/** How the guarantor knows the customer (dropdown; "Other" adds a short text box). */
export const GUARANTOR_RELATIONSHIPS = [
  'Spouse',
  'Parent',
  'Brother',
  'Sister',
  'Child',
  'Other relative',
  'Friend',
  'Colleague',
  'Employer',
  'Mentor',
  'Religious leader',
  'Other',
] as const

export type GuarantorRelationship = (typeof GUARANTOR_RELATIONSHIPS)[number]

const OTHER_PREFIX = 'Other: '

/** Form fields → the stored text: the option, or "Other: <description>". */
export const guarantorRelationshipSchema = z
  .object({
    relationship: z.enum(GUARANTOR_RELATIONSHIPS, { error: 'Choose how you know them' }),
    relationshipOther: z.string().trim().max(40, 'Keep it short (40 characters)').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.relationship === 'Other' && (v.relationshipOther ?? '').length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['relationshipOther'],
        message: 'Say how you know them',
      })
    }
  })
  .transform((v) =>
    v.relationship === 'Other' ? `${OTHER_PREFIX}${v.relationshipOther}` : v.relationship,
  )

/** Stored text → the dropdown and text box (older free-text answers show as Other). */
export function splitRelationship(stored: string): {
  relationship: GuarantorRelationship | ''
  relationshipOther: string
} {
  const s = stored.trim()
  if (!s) return { relationship: '', relationshipOther: '' }
  if ((GUARANTOR_RELATIONSHIPS as readonly string[]).includes(s) && s !== 'Other') {
    return { relationship: s as GuarantorRelationship, relationshipOther: '' }
  }
  return {
    relationship: 'Other',
    relationshipOther: s.startsWith(OTHER_PREFIX) ? s.slice(OTHER_PREFIX.length) : s,
  }
}
