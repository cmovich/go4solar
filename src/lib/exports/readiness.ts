import { completeness, type ProfileValues } from '@/lib/tradeLenda/profile'

/**
 * What a waiting-list person can be exported as, per funder (pure). Blockers: name, phone and
 * consent for THAT funder only (Semako, 25 Nov 2026). BASIC leaves out date of birth, work,
 * income and the guarantor; FULL includes whatever of them is filled in.
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

/**
 * What can go to this funder (Semako, 25 Nov 2026: stop blocking exports; the funder collects
 * missing details on its own platform). The ONLY blockers: a name, a phone, and consent to share
 * with THAT funder. Everything else (customer type, WhatsApp, email, address, the quote, the two
 * records ticks, a business's name and role) is a warning: it exports blank. Level: Full when the
 * Full-only details are filled in, else Basic.
 */
export function exportReadiness(
  v: ProfileValues,
  t: RecordTicks,
  consents: FunderConsent[],
  funderId: string,
): {
  level: ExportLevel | null
  blockers: string[]
  warnings: string[]
  fullMissing: string[]
} {
  const blockers = [
    ...(empty(v.firstName) && empty(v.surname) ? ['name'] : []),
    ...(empty(v.phone) ? ['phone'] : []),
    ...(activeConsent(consents, funderId) ? [] : ['consent to share with this funder']),
  ]
  const warnings = [
    ...completeness(v).missing.filter((m) => !HARD.includes(m)),
    ...recordsMissing(t),
  ]
  const fullMissing = FULL_EXTRA.filter(([k]) => empty(v[k])).map(([, label]) => label)
  const level: ExportLevel | null =
    blockers.length > 0 ? null : fullMissing.length > 0 ? 'basic' : 'full'
  return { level, blockers, warnings, fullMissing }
}

/** Covered by the blockers (a name, a phone), so never listed again as a warning. */
const HARD = ['first name', 'surname', 'phone']

/** The waiting-list column (before choosing a funder): "Full ready", "Basic ready" or "x of N". */
export function readinessLabel(v: ProfileValues, t: RecordTicks): string {
  const c = completeness(v)
  const missing = c.missing.length + recordsMissing(t).length
  const total = c.total + 2
  if (missing > 0) return `${total - missing} of ${total}`
  return FULL_EXTRA.some(([k]) => empty(v[k])) ? 'Basic ready' : 'Full ready'
}

/** One funder in the edit page's consent block. */
export type ConsentFunder = {
  id: string
  name: string
  hasContactEmail: boolean
  consentedAt: string | null
  consentedBy: string | null
  consentNote: string | null
  withdrawnAt: string | null
  withdrawnBy: string | null
  withdrawnNote: string | null
  funderToldAt: string | null
  /** Batches this person was exported in, for this funder. */
  exportedIn: string[]
  /** What can go to this funder now. */
  level: 'basic' | 'full' | null
  /** Blocked: what blocks (name, phone, consent). Basic: what Full would add. */
  missing: string[]
  /** Exported blank; never blocks ("Missing: landmark, email"). */
  warnings: string[]
}
