import type { QuoteResult } from '@/lib/pricing/types'
import { cashPrice } from '@/lib/quotes/quote'

/**
 * "See breakdown" under the builder's price (pure): items, installation, delivery, the price,
 * the deposit, the amount financed, the monthly payment and the total payable.
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
  financed: number
  monthly: number
  months: number
  totalPayable: number
  offer: boolean
}

export function quoteBreakdown(q: QuoteResult): QuoteBreakdown {
  const offer = Boolean(q.snapshot.offer)
  const installation = q.noMarkup
    .filter((l) => l.label.startsWith('Installation'))
    .reduce((s, l) => s + l.amount, 0)
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
    monthly: q.monthly,
    months: q.instalments.length,
    totalPayable: q.systemPrice,
    offer,
  }
}
