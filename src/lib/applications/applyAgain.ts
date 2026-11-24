/**
 * "Apply again" after a decline (Semako, 23 Nov 2026), pure. The admin who declines may tick
 * "Customer may apply again" (default off; who/when/note kept in the application's credit_flags).
 * Only then does the customer's dashboard offer it: with the same quotation while it is still
 * valid, otherwise a new quotation first (the new figures are shown before they continue).
 */
export type ApplyAgainFlag = { by: string; at: string; note: string | null }

export type ApplyAgainState =
  { kind: 'hidden' } | { kind: 'same-quote' } | { kind: 'new-quote'; path: string }

export function mayApplyAgainFlag(creditFlags: unknown): ApplyAgainFlag | null {
  const f = (creditFlags as { mayApplyAgain?: unknown } | null)?.mayApplyAgain as
    Partial<ApplyAgainFlag> | undefined
  if (!f || typeof f.by !== 'string' || typeof f.at !== 'string') return null
  return { by: f.by, at: f.at, note: typeof f.note === 'string' ? f.note : null }
}

/** Where a new quotation of the same kind is made (calculator plans, own system, ready-made plan). */
function newQuotePath(q: { readySlug: string | null; isBuilder: boolean }): string {
  if (q.readySlug) return `/plans/${encodeURIComponent(q.readySlug)}`
  return q.isBuilder ? '/build' : '/get-started'
}

export function applyAgainState(input: {
  status: string
  creditFlags: unknown
  quote: { validUntil: string | null; readySlug: string | null; isBuilder: boolean } | null
  now: Date
}): ApplyAgainState {
  if (input.status !== 'declined' || !mayApplyAgainFlag(input.creditFlags) || !input.quote)
    return { kind: 'hidden' }
  const valid =
    input.quote.validUntil !== null &&
    new Date(input.quote.validUntil).getTime() >= input.now.getTime()
  return valid ? { kind: 'same-quote' } : { kind: 'new-quote', path: newQuotePath(input.quote) }
}
