import { completeness, type ProfileValues } from '@/lib/tradeLenda/profile'

/**
 * What a waiting-list person can be exported as, per funder (pure; Semako, 23 Nov 2026):
 * - BASIC: the basic fields (customer type, name, phone, WhatsApp, email, state, LGA, street,
 *   landmark, the quote; a business also its name and contact role) + "Details confirmed by
 *   phone" + "Agreed to the quote figures" + consent to share with THAT funder.
 * - FULL: Basic + date of birth, work, income and the guarantor (name, phone, relationship).
 */
export type FunderConsent = {
  funderId: string
  consentedAt: string | null
  withdrawnAt: string | null
}
export type RecordTicks = { phoneVerifiedAt: string | null; figuresAgreedAt: string | null }
export type ExportLevel = 'basic' | 'full'

/** Fields Full adds to Basic (label shown in "Missing: …"). */
export const FULL_EXTRA: [keyof ProfileValues, string][] = [
  ['dateOfBirth', 'date of birth'],
  ['employmentType', 'work'],
  ['incomeRange', 'income'],
  ['guarantorName', 'guarantor name'],
  ['guarantorPhone', 'guarantor phone'],
  ['guarantorRelationship', 'guarantor relationship'],
]

const empty = (v: unknown) => v === null || v === undefined || v === ''

/** The customer agreed to share their details with this funder, and has not withdrawn. */
export function activeConsent(consents: FunderConsent[], funderId: string): boolean {
  return consents.some((c) => c.funderId === funderId && !!c.consentedAt && !c.withdrawnAt)
}

function recordsMissing(t: RecordTicks): string[] {
  const out: string[] = []
  if (!t.phoneVerifiedAt) out.push('details confirmed by phone')
  if (!t.figuresAgreedAt) out.push('agreed to the quote figures')
  return out
}

export function exportReadiness(
  v: ProfileValues,
  t: RecordTicks,
  consents: FunderConsent[],
  funderId: string,
): { level: ExportLevel | null; basicMissing: string[]; fullMissing: string[] } {
  const basicMissing = [
    ...completeness(v).missing,
    ...recordsMissing(t),
    ...(activeConsent(consents, funderId) ? [] : ['consent to share with this funder']),
  ]
  const fullMissing = FULL_EXTRA.filter(([k]) => empty(v[k])).map(([, label]) => label)
  const level: ExportLevel | null =
    basicMissing.length > 0 ? null : fullMissing.length > 0 ? 'basic' : 'full'
  return { level, basicMissing, fullMissing }
}

/** The waiting-list column (before choosing a funder): "Full ready", "Basic ready" or "x of N". */
export function readinessLabel(v: ProfileValues, t: RecordTicks): string {
  const c = completeness(v)
  const missing = c.missing.length + recordsMissing(t).length
  const total = c.total + 2
  if (missing > 0) return `${total - missing} of ${total}`
  return FULL_EXTRA.some(([k]) => empty(v[k])) ? 'Basic ready' : 'Full ready'
}
