import type { QuoteResult } from '@/lib/pricing/types'
import { basePrice } from '@/lib/quotes/quote'

/**
 * The price paid in full for a stored quote (pure): no payment-plan cost. A ready-made plan: its
 * item prices plus installation and delivery (the plan price, + any extra delivery). Any other
 * quote: items at cost + base margin (SPEWA items at their selling price) + installation and
 * delivery. Null when the quote cannot be read.
 */
export function priceInFullOf(result: unknown, builder: unknown): number | null {
  const q = result as QuoteResult | null | undefined
  if (!q?.snapshot || !Array.isArray(q.lines)) return null
  if ((builder as { kind?: string } | null)?.kind === 'ready') {
    return q.lines.reduce((s, l) => s + l.lineTotal, 0) + q.installCost
  }
  return basePrice(q.snapshot)
}
