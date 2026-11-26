import type { QuoteResult } from '@/lib/pricing/types'
import { basePrice, cashPrice } from '@/lib/quotes/quote'

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
  /** Pay in full (home on the ready-made terms: the fixed cash price; SPEWA: price without the charge). */
  cashPrice: number
  offer: boolean
}

/**
 * What a customer's browser gets (home and business): the deposit, the monthly payment, the
 * total payable and the cash price. Every other amount is 0 and never shown; installation and
 * delivery only say whether they are included.
 */
export type CustomerBreakdown = QuoteBreakdown & {
  customer: true
  hasInstallation: boolean
  hasDelivery: boolean
}

export function customerBreakdown(b: QuoteBreakdown): CustomerBreakdown {
  return {
    ...b,
    items: 0,
    installation: 0,
    delivery: 0,
    price: 0,
    financed: 0,
    charge: 0,
    balance: 0,
    hasInstallation: b.installation > 0,
    hasDelivery: b.delivery > 0,
    customer: true,
  }
}

export function quoteBreakdown(q: QuoteResult): QuoteBreakdown {
  const offer = Boolean(q.snapshot.offer)
  // Quotes saved before installation and delivery were itemised have no noMarkup list: the
  // whole installCost was installation then.
  const installation = Array.isArray(q.noMarkup)
    ? q.noMarkup.filter((l) => l.label.startsWith('Installation')).reduce((s, l) => s + l.amount, 0)
    : q.installCost
  const delivery = q.installCost - installation
  // SPEWA offer and home quotes on the ready-made terms: the price is before the charge.
  const price = offer || q.snapshot.terms ? basePrice(q.snapshot) : q.systemPrice
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
    cashPrice: cashPrice(q.snapshot),
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

/**
 * The deposit on the slider (whole percent) and the deposit the shown figures were priced at
 * are the same. While a new price is on its way they differ: show "Updating…", never the old
 * figure under the new percentage.
 */
export function depositInSync(sliderPct: number, pricedShare: number | null | undefined): boolean {
  return pricedShare != null && Math.round(pricedShare * 100) === Math.round(sliderPct)
}
