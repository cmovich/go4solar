/** The name on a file: the business's registered name, else the applicant's own name. */
type Personal = { firstName?: string; surname?: string }
type Business = { registeredName?: string; businessName?: string } | null

export function applicantName(a: {
  applicant_type: string
  personal: unknown
  business: unknown
}): string {
  const p = (a.personal ?? {}) as Personal
  const b = a.business as Business
  const person = [p.firstName, p.surname].filter(Boolean).join(' ')
  return a.applicant_type === 'business' ? (b?.registeredName ?? b?.businessName ?? person) : person
}
