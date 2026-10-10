/** Pure application-wizard rules: steps per pathway, KYC attempt limits, affordability. */

export type ApplicantType = 'individual' | 'business'

export type StepId =
  | 'details'
  | 'business'
  | 'nin'
  | 'bvn'
  | 'consent'
  | 'face'
  | 'address'
  | 'income'
  | 'nextOfKin'
  | 'guarantor'
  | 'review'

export const STEP_LABELS: Record<StepId, string> = {
  details: 'Confirm your details',
  business: 'Business verification',
  nin: 'NIN',
  bvn: 'BVN',
  consent: 'Consent',
  face: 'Face check',
  address: 'Address and site',
  income: 'Income',
  nextOfKin: 'Next of kin',
  guarantor: 'Guarantor',
  review: 'Review',
}

export function stepsFor(type: ApplicantType): StepId[] {
  return type === 'business'
    ? [
        'details',
        'business',
        'nin',
        'bvn',
        'consent',
        'face',
        'address',
        'income',
        'guarantor',
        'review',
      ]
    : [
        'details',
        'nin',
        'bvn',
        'consent',
        'face',
        'address',
        'income',
        'nextOfKin',
        'guarantor',
        'review',
      ]
}

/** First incomplete step (resume point). */
export function nextStep(type: ApplicantType, done: Partial<Record<StepId, boolean>>): StepId {
  return stepsFor(type).find((s) => !done[s]) ?? 'review'
}

// ------------------------------------------------------------------ KYC rules
export type KycKind = 'nin' | 'bvn' | 'liveness' | 'face_match' | 'address' | 'cac'
export type KycStatus = 'pending' | 'passed' | 'failed' | 'manual_review'
export type CheckSummary = { kind: KycKind; status: KycStatus; attempt: number }

/** Paid checks are tried at most 3 times per applicant, then a person reviews them. */
export const KYC_MAX_ATTEMPTS = 3

export type AttemptDecision =
  { allowed: true; attempt: number } | { allowed: false; reason: 'passed' | 'manual_review' }

export function nextAttempt(checks: CheckSummary[], kind: KycKind): AttemptDecision {
  const mine = checks.filter((c) => c.kind === kind)
  if (mine.some((c) => c.status === 'passed')) return { allowed: false, reason: 'passed' }
  if (mine.some((c) => c.status === 'manual_review'))
    return { allowed: false, reason: 'manual_review' }
  const attempts = mine.reduce((max, c) => Math.max(max, c.attempt), 0)
  if (attempts >= KYC_MAX_ATTEMPTS) return { allowed: false, reason: 'manual_review' }
  return { allowed: true, attempt: attempts + 1 }
}

/** Status to store for a provider result: a 3rd failure becomes manual_review. */
export function statusAfter(result: 'passed' | 'failed', attempt: number): KycStatus {
  if (result === 'passed') return 'passed'
  return attempt >= KYC_MAX_ATTEMPTS ? 'manual_review' : 'failed'
}

export function latestStatus(checks: CheckSummary[], kind: KycKind): KycStatus | null {
  const mine = checks.filter((c) => c.kind === kind)
  if (mine.some((c) => c.status === 'passed')) return 'passed'
  if (mine.some((c) => c.status === 'manual_review')) return 'manual_review'
  return mine.length ? (mine[mine.length - 1]?.status ?? null) : null
}

/** The cheapest check first: liveness only after the NIN passed and consent was given. */
export function canStartLiveness(checks: CheckSummary[], biometricConsent: boolean): boolean {
  return biometricConsent && latestStatus(checks, 'nin') === 'passed'
}

// --------------------------------------------------------------- affordability
export const INCOME_RANGES = [
  { id: 'below_100k', label: 'Below ₦100,000', midpoint: 50000 },
  { id: '100k_250k', label: '₦100,000 – ₦250,000', midpoint: 175000 },
  { id: '250k_500k', label: '₦250,000 – ₦500,000', midpoint: 375000 },
  { id: '500k_1m', label: '₦500,000 – ₦1,000,000', midpoint: 750000 },
  { id: '1m_3m', label: '₦1,000,000 – ₦3,000,000', midpoint: 2000000 },
  { id: 'above_3m', label: 'Above ₦3,000,000', midpoint: 4000000 },
] as const
export type IncomeRangeId = (typeof INCOME_RANGES)[number]['id']

/** Monthly payment above this share of income is flagged for the credit officer (never blocks). */
export const INCOME_RATIO_FLAG = 0.35

export type Affordability = {
  monthlyPayment: number
  incomeMidpoint: number | null
  incomeRatio: number | null
  incomeFlag: boolean
  monthlyEnergySpend: number | null
  energyRatio: number | null
  /** Monthly payment ≤ what they already spend on power. */
  paysForItself: boolean | null
}

export function affordability(input: {
  monthlyPayment: number
  incomeRange: string | null
  monthlyEnergySpend: number | null
}): Affordability {
  const mid = INCOME_RANGES.find((r) => r.id === input.incomeRange)?.midpoint ?? null
  const incomeRatio = mid ? input.monthlyPayment / mid : null
  const spend =
    input.monthlyEnergySpend && input.monthlyEnergySpend > 0 ? input.monthlyEnergySpend : null
  const energyRatio = spend ? input.monthlyPayment / spend : null
  return {
    monthlyPayment: input.monthlyPayment,
    incomeMidpoint: mid,
    incomeRatio,
    incomeFlag: incomeRatio !== null && incomeRatio > INCOME_RATIO_FLAG,
    monthlyEnergySpend: spend,
    energyRatio,
    paysForItself: energyRatio === null ? null : energyRatio <= 1,
  }
}

// ------------------------------------------------------- business requirements
export function businessStepComplete(input: {
  cacStatus: KycStatus | null
  certificateUploaded: boolean
  directorConfirmed: boolean
}): boolean {
  return (
    (input.cacStatus === 'passed' || input.cacStatus === 'manual_review') &&
    input.certificateUploaded &&
    input.directorConfirmed
  )
}

/** Everything still missing before the application can move on (empty list = complete). */
export function missingForSubmission(input: {
  applicantType: ApplicantType
  steps: Partial<Record<StepId, boolean>>
  checks: CheckSummary[]
  documents: string[]
  directorConfirmed: boolean
  biometricConsent: boolean
}): string[] {
  const missing: string[] = []
  for (const s of stepsFor(input.applicantType)) {
    if (s !== 'review' && !input.steps[s]) missing.push(`step:${s}`)
  }
  if (!input.biometricConsent) missing.push('biometric_consent')
  if (!latestStatus(input.checks, 'nin')) missing.push('nin_check')
  if (!latestStatus(input.checks, 'bvn')) missing.push('bvn_check')
  if (!input.documents.includes('address_proof')) missing.push('address_proof')
  if (input.applicantType === 'business') {
    const cac = latestStatus(input.checks, 'cac')
    if (cac !== 'passed' && cac !== 'manual_review') missing.push('cac_check')
    if (!input.documents.includes('cac_certificate')) missing.push('cac_certificate')
    if (!input.documents.includes('business_statement')) missing.push('business_statement')
    if (!input.directorConfirmed) missing.push('director_confirmation')
  }
  return missing
}

/** "•••••••4521" — the only form a NIN/BVN is ever shown in. */
export function maskId(last4: string | null | undefined): string {
  return last4 ? `•••••••${last4}` : '—'
}
