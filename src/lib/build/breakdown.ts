import type { QuoteResult } from '@/lib/pricing/types'
import { cashPrice } from '@/lib/quotes/quote'

/**
 * "See breakdown" under the builder's price (pure): items, installation, delivery, the price,
 * the deposit, the amount financed (price − deposit), the payment plan charge, the balance to
 * repay monthly (financed + charge), the monthly payment and the total payable. Every screen and
 * document that shows these figures reads them from here (quotation, invoice, SPEWA queue and
 * file, approval panel).
 *
 * Home (PRD formula): the payment-plan cost is part of the one fixed price, so the price IS the
 * total payable and the deposit is its share. SPEWA offer (business or institution): the price
 * is before the charge (items at the selling price + installation + delivery); the deposit is
 * its share and the total payable = deposit + financed × (1 + charge).
 */
export type QuoteBreakdown = {
  items: number
  installation: number
  delivery: number
  price: number
  depositShare: number
  deposit: number
  /** Price − deposit (before any payment plan charge). */
  financed: number
  /** SPEWA offer: the payment plan charge on the financed amount; home quotes: 0 (in the price). */
  charge: number
  /** Financed + charge: what the monthly payments add up to. */
  balance: number
  monthly: number
  months: number
  totalPayable: number
  offer: boolean
}

export function quoteBreakdown(q: QuoteResult): QuoteBreakdown {
  const offer = Boolean(q.snapshot.offer)
  // Quotes saved before installation and delivery were itemised have no noMarkup list: the
  // whole installCost was installation then.
  const installation = Array.isArray(q.noMarkup)
    ? q.noMarkup.filter((l) => l.label.startsWith('Installation')).reduce((s, l) => s + l.amount, 0)
    : q.installCost
  const delivery = q.installCost - installation
  const price = offer ? cashPrice(q.snapshot) : q.systemPrice
  return {
    items: price - q.installCost,
    installation,
    delivery,
    price,
    depositShare: q.snapshot.depositShare,
    deposit: q.deposit,
    financed: price - q.deposit,
    charge: q.systemPrice - price,
    balance: q.systemPrice - q.deposit,
    monthly: q.monthly,
    months: q.instalments.length,
    totalPayable: q.systemPrice,
    offer,
  }
}

/**
 * The breakdown of a stored quote, or null when the stored quote is empty or broken (very old
 * test data): screens show "—" instead of failing. Use this for quotes read from the database.
 */
export function safeBreakdown(q: QuoteResult | null | undefined): QuoteBreakdown | null {
  if (
    !q ||
    typeof q.systemPrice !== 'number' ||
    typeof q.deposit !== 'number' ||
    typeof q.installCost !== 'number' ||
    !q.snapshot ||
    !Array.isArray(q.instalments)
  )
    return null
  try {
    return quoteBreakdown(q)
  } catch {
    return null
  }
}
