/**
 * Never mix one person's quote with another person's account (Semako, 30 Oct): pure rules for
 * the account page and the application wizard.
 */

type Person = { fullName: string | null; phone: string | null }

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Is the signed-in account the person the new quote was made for? Compares the name (ignoring
 * case and spaces) and the phone, each only when the account has one.
 */
export function sameApplicant(account: Person, quote: Person): boolean {
  if (account.fullName && quote.fullName && norm(account.fullName) !== norm(quote.fullName)) {
    return false
  }
  if (account.phone && quote.phone && account.phone !== quote.phone) return false
  return true
}

export type ApplicationStatus =
  'draft' | 'submitted' | 'under_review' | 'approved' | 'declined' | 'more_info'

/**
 * What a newly chosen quote does to the account's latest application:
 *  - new: no application, or the last one was declined → start one for the new quote
 *  - keep: the application already uses the newest quote (or there is no chosen quote)
 *  - switch: an unsigned draft → it moves to the new quote (the guarantor is asked again)
 *  - blocked: signed or submitted → it stays as it is; the new quote waits
 */
export function applicationForNewQuote(input: {
  app: { status: ApplicationStatus; quoteId: string | null } | null
  latestQuoteId: string | null
  consumerSigned: boolean
  guarantorSigned: boolean
}): 'new' | 'keep' | 'switch' | 'blocked' {
  const { app, latestQuoteId } = input
  if (!app) return 'new'
  if (!latestQuoteId || app.quoteId === latestQuoteId) return 'keep'
  if (app.status === 'declined') return 'new'
  if (app.status === 'draft' && !input.consumerSigned && !input.guarantorSigned) return 'switch'
  return 'blocked'
}
