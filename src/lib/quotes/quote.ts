import { roundNaira } from '@/lib/money'
import { flatCharge } from '@/lib/pricing/flat'
import { priceQuote } from '@/lib/pricing/price'
import { offeredTenures } from '@/lib/pricing/tenures'
import type { QuoteSnapshot, TenureMonths } from '@/lib/pricing/types'
import type { Plan } from '@/lib/sizing/types'

import type { Estimate, RepricedPlan } from './buildEstimate'

const DAY_MS = 24 * 60 * 60 * 1000

/** Short, readable reference shown to customers and advisors, e.g. G4S-3F9A1C2E. */
export function quoteReference(id: string): string {
  return `G4S-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

export function validUntil(from: Date, validityDays: number): Date {
  return new Date(from.getTime() + validityDays * DAY_MS)
}

/** Prices move with the exchange rate: an estimate older than the validity window is re-priced. */
export function estimateIsStale(
  pricedAt: string | null | undefined,
  validityDays: number,
  now = new Date(),
): boolean {
  if (!pricedAt) return true
  return now.getTime() - new Date(pricedAt).getTime() > validityDays * DAY_MS
}

/** The customer asked for a payment-plan length this estimate does not offer. */
export class TenureNotOfferedError extends RangeError {
  constructor(public readonly tenureMonths: number) {
    super(`${tenureMonths} months is not offered for this estimate`)
    this.name = 'TenureNotOfferedError'
  }
}

/**
 * One plan of a stored estimate at a chosen tenure and deposit. Uses ONLY the estimate's own
 * snapshot (lines, margins, installation) and the per-tenure rates captured with it, so later
 * pricing changes never alter it.
 */
export function priceVariant(
  estimate: Estimate,
  plan: Plan,
  tenureMonths: TenureMonths,
  depositShare: number,
  /** Tenures switched on today (current settings); a tenure switched off since is refused. */
  enabledNow?: readonly TenureMonths[],
): RepricedPlan {
  const base = estimate.plans[plan]
  const snap = base.quote.snapshot
  // Home quotes on the ready-made terms: the Tenure rates switches do not apply.
  const switchedOn = snap.terms ? undefined : enabledNow
  if (!offeredTenures(estimate.pricingRateByTenure, switchedOn).includes(tenureMonths)) {
    throw new TenureNotOfferedError(tenureMonths)
  }
  const rate = estimate.pricingRateByTenure?.[tenureMonths] ?? snap.pricingRateAnnual
  const at = (share: number) =>
    priceQuote({
      lines: snap.lines,
      installCost: snap.installCost,
      noMarkup: snap.noMarkup,
      marginByCategory: snap.marginByCategory,
      pricingRateAnnual: rate,
      tenureMonths,
      depositShare: share,
      minDepositShare: snap.minDepositShare,
      offer: snap.offer,
      terms: snap.terms,
    })
  const quote = at(depositShare)
  const atMin = depositShare === snap.minDepositShare ? quote : at(snap.minDepositShare)
  return { ...base, quote, savingVsMin: atMin.systemPrice - quote.systemPrice }
}

/**
 * The price before any financing: items (cost + base margins; SPEWA offer: SPEWA items at their
 * selling price) + installation + delivery.
 */
export function basePrice(snap: QuoteSnapshot): number {
  return roundNaira(
    snap.lines.reduce(
      (sum, l) =>
        sum +
        (snap.offer && l.sellUnit !== undefined
          ? l.sellUnit * l.qty
          : l.unitCost * l.qty * (1 + snap.marginByCategory[l.category])),
      0,
    ) + snap.installCost,
  )
}

/**
 * What a customer pays to buy outright (pay in full).
 * - Home quotes on the ready-made terms: the 12-month total at the lowest deposit less the
 *   pay-in-full discount; the same whatever deposit or length the customer picked.
 * - SPEWA offer: the price without the payment plan charge.
 * - Older home quotes: cost + base margins + installation, no financing.
 */
export function cashPrice(snap: QuoteSnapshot): number {
  const base = basePrice(snap)
  if (!snap.terms || snap.offer) return base
  const deposit = roundNaira(base * snap.minDepositShare)
  const total12 = deposit + roundNaira((base - deposit) * (1 + flatCharge(snap.terms, 12)))
  return roundNaira(total12 * (1 - snap.terms.fullDiscount))
}
