export type Eligibility = 'ok' | 'under_18' | 'same_as_applicant' | 'too_many'

export const ELIGIBILITY_MESSAGES: Record<Exclude<Eligibility, 'ok'>, string> = {
  under_18: 'A guarantor must be 18 or older.',
  same_as_applicant: 'The applicant cannot be their own guarantor.',
  too_many: 'You are already guaranteeing the maximum number of payment plans.',
}

function ageOn(dob: string, now: Date): number {
  const d = new Date(dob)
  let age = now.getUTCFullYear() - d.getUTCFullYear()
  const m = now.getUTCMonth() - d.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--
  return age
}

/** Who may guarantee: an adult, not the applicant, under the per-person limit. */
export function guarantorEligibility(input: {
  dob: string
  ninHash: string
  ninLast4: string
  applicantNinHash: string | null
  applicantNinLast4: string | null
  activeGuarantees: number
  maxActive: number
  now?: Date
}): Eligibility {
  if (ageOn(input.dob, input.now ?? new Date()) < 18) return 'under_18'
  const same = input.applicantNinHash
    ? input.applicantNinHash === input.ninHash
    : input.applicantNinLast4 !== null && input.applicantNinLast4 === input.ninLast4
  if (same) return 'same_as_applicant'
  if (input.activeGuarantees >= input.maxActive) return 'too_many'
  return 'ok'
}
