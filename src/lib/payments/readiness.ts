import { latestStatus, type CheckSummary } from '@/lib/applications/rules'

type RequiredKind = 'cac' | 'nin' | 'bvn' | 'liveness'

const CHECK_TODO: Record<RequiredKind, string> = {
  cac: 'Confirm your business registration (CAC)',
  nin: 'Confirm your NIN',
  bvn: 'Confirm your BVN',
  liveness: 'Complete the face check',
}

/**
 * The deposit unlocks when the customer and the guarantor have signed and every ID check has
 * passed or is with a person (manual_review). Otherwise, the list of what is still missing.
 */
export function depositReadiness(input: {
  applicantType: 'individual' | 'business'
  consumerSigned: boolean
  guarantorSigned: boolean
  checks: CheckSummary[]
  /** The face check was skipped because the NIN went to manual review. */
  livenessDeferred: boolean
}): { ready: boolean; missing: string[] } {
  const missing: string[] = []
  if (!input.consumerSigned) missing.push('Sign your payment plan agreement')
  if (!input.guarantorSigned) missing.push('Your guarantor needs to sign')
  const kinds: RequiredKind[] = [
    ...(input.applicantType === 'business' ? (['cac'] as const) : []),
    'nin',
    'bvn',
    ...(input.livenessDeferred ? [] : (['liveness'] as const)),
  ]
  for (const kind of kinds) {
    const s = latestStatus(input.checks, kind)
    if (s !== 'passed' && s !== 'manual_review') missing.push(CHECK_TODO[kind])
  }
  return { ready: missing.length === 0, missing }
}
