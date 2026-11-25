import type { QuoteResult } from '@/lib/pricing/types'

/**
 * A stored quote (quotes.result) only when it has every field the pages read; otherwise null, and
 * the page shows "Quote details unavailable" instead of failing (pure). Very old or broken test
 * quotes can be empty ({}) or miss parts. A SPEWA offer that is not an object counts as no offer.
 */
export function usableQuote(result: unknown): QuoteResult | null {
  if (!result || typeof result !== 'object') return null
  const q = result as Partial<QuoteResult>
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  if (
    !num(q.systemPrice) ||
    !num(q.deposit) ||
    !num(q.balance) ||
    !num(q.monthly) ||
    !num(q.installCost) ||
    !Array.isArray(q.lines) ||
    !Array.isArray(q.instalments) ||
    !q.snapshot ||
    typeof q.snapshot !== 'object' ||
    !Array.isArray(q.snapshot.lines) ||
    !num(q.snapshot.depositShare)
  )
    return null
  const offer = q.snapshot.offer as unknown
  if (offer !== undefined && (offer === null || typeof offer !== 'object')) {
    const { offer: _drop, ...snapshot } = q.snapshot
    void _drop
    return { ...(q as QuoteResult), snapshot: snapshot as QuoteResult['snapshot'] }
  }
  return q as QuoteResult
}
