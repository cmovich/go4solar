import { priceQuote } from '@/lib/pricing/price'
import type { QuoteResult, RateByTenure, TenureMonths } from '@/lib/pricing/types'
import { basePrice } from '@/lib/quotes/quote'
import { planPrice, priceReadyPlan, vendorTotal } from '@/lib/readyPlans/price'
import type { ReadyPlan } from '@/lib/readyPlans/types'

/**
 * The plan behind a waiting-list profile (pure): what the customer chose, priced for Trade Lenda.
 *  ready     a ready-made plan: price = the plan price
 *  builder   a system from the builder: price = paid in full (items + installation + delivery)
 *  estimate  one of the calculator's three plans: the same
 * `cost` is OUR cost: used for our own profit only, never put in a funder snapshot.
 */
export type PlanItem = { name: string; spec: string; qty: number }

export type PlanBasis = {
  label: string
  items: PlanItem[]
  /** The price Trade Lenda's 4% is worked on when it lends to the customer. */
  priceInFull: number
  /** Our cost (vendor costs + installation and delivery at cost). Internal only. */
  cost: number
  /** The customer's figures on OUR terms at this deposit and length (when Trade Lenda lends to us). */
  quoted: {
    price: number
    depositShare: number
    deposit: number
    totalPayable: number
    monthly: number
  }
  /** SPEWA offer quotes only: the payment plan charge at this deposit and length (else null). */
  planCharge?: number | null
}

const itemsOfQuote = (q: QuoteResult): PlanItem[] => [
  ...q.snapshot.lines.map((l) => ({ name: l.name, spec: '', qty: l.qty })),
  ...(q.snapshot.noMarkup ?? []).map((l) => ({ name: l.label, spec: '', qty: 1 })),
]

/** A ready-made plan (with the shared terms already applied). */
export function readyPlanBasis(p: ReadyPlan, months: number): PlanBasis {
  const priced = priceReadyPlan(p, months)
  return {
    label: `${p.name} (ready-made plan)`,
    items: p.lines.map((l) => ({ name: l.name, spec: l.spec, qty: l.qty })),
    priceInFull: planPrice(p),
    cost: vendorTotal(p),
    quoted: {
      price: priced.planPrice,
      depositShare: p.depositShare,
      deposit: priced.deposit,
      totalPayable: priced.totalPayable,
      monthly: priced.monthly,
    },
  }
}

/**
 * A builder system or a calculator plan: its stored quote, priced again at this deposit and
 * length with the rate for that length (`rates`: the estimate's own, else today's).
 */
export function quoteBasis(
  label: string,
  q: QuoteResult,
  depositShare: number,
  months: TenureMonths,
  rates: RateByTenure,
): PlanBasis {
  const snap = q.snapshot
  const again = priceQuote({
    lines: snap.lines,
    installCost: snap.installCost,
    noMarkup: snap.noMarkup,
    marginByCategory: snap.marginByCategory,
    pricingRateAnnual: rates[months] ?? snap.pricingRateAnnual,
    tenureMonths: months,
    depositShare: Math.max(depositShare, snap.minDepositShare),
    minDepositShare: snap.minDepositShare,
    offer: snap.offer,
    terms: snap.terms,
  })
  return {
    label,
    items: itemsOfQuote(q),
    priceInFull: basePrice(snap),
    cost: q.costPrice,
    quoted: {
      price: again.systemPrice,
      depositShare: again.snapshot.depositShare,
      deposit: again.deposit,
      totalPayable: again.systemPrice,
      monthly: again.monthly,
    },
    planCharge: again.planCharge?.amount ?? null,
  }
}
