export type Eligibility =
  'ok' | 'under_18' | 'same_as_applicant' | 'too_many' | 'applicant_not_ready'

export const ELIGIBILITY_MESSAGES: Record<Exclude<Eligibility, 'ok'>, string> = {
  under_18: 'A guarantor must be 18 or older.',
  same_as_applicant: 'The applicant cannot be their own guarantor.',
  too_many: 'You are already guaranteeing the maximum number of payment plans.',
  applicant_not_ready:
    "The customer's ID check is not finished yet. Please try again later or contact Go4Solar.",
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
  /** Keyed hashes (idHash) of the full NINs — never the last 4 digits. */
  ninHash: string
  applicantNinHash: string | null
  activeGuarantees: number
  maxActive: number
  now?: Date
}): Eligibility {
  if (ageOn(input.dob, input.now ?? new Date()) < 18) return 'under_18'
  if (!input.applicantNinHash) return 'applicant_not_ready'
  if (input.applicantNinHash === input.ninHash) return 'same_as_applicant'
  if (input.activeGuarantees >= input.maxActive) return 'too_many'
  return 'ok'
}
