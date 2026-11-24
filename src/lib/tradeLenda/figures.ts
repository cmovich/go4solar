import { funderFinancing } from '@/lib/funders/financing'
import { roundNaira } from '@/lib/money'

/**
 * Trade Lenda figures (pure). Every batch has ONE lending type:
 *
 *  'customer'  Trade Lenda lends to the customer and pays Go4Solar the price upfront.
 *              price    = the price paid in full (ready-made plan: the plan price; builder or
 *                         calculator plan: items + installation + delivery, without our
 *                         payment-plan cost)
 *              deposit  = price × deposit share; financed = price − deposit
 *              total    = financed × (1 + monthly rate × months); repayment = deposit + total
 *
 *  'go4solar'  Trade Lenda lends to Go4Solar; the customer keeps the figures we quoted.
 *              drawn    = price paid in full − deposit (tradeLendaDrawn), NEVER a figure based on
 *                         our cost, so Trade Lenda cannot work out our margin
 *              interest = drawn × monthly rate × months; repayment = drawn + interest
 */
export type LendingType = 'customer' | 'go4solar'
export const LENDING_TYPES = ['customer', 'go4solar'] as const

export const LENDING_TYPE_LABELS: Record<LendingType, string> = {
  customer: 'Trade Lenda lends to the customers',
  go4solar: 'Trade Lenda lends to Go4Solar',
}
export const LENDING_TYPE_SHORT: Record<LendingType, string> = {
  customer: 'Lends to customers',
  go4solar: 'Lends to Go4Solar',
}

/**
 * What Trade Lenda hands over, for BOTH lending types: the price paid in full (items +
 * installation + delivery, without our payment-plan cost) − the deposit. The one figure for the
 * balance taken at approval, the "drawn" amount, the interest and the "amount financed".
 */
export const tradeLendaDrawn = (i: { priceInFull: number; deposit: number }) =>
  funderFinancing({
    kind: 'monthly-rate',
    priceInFull: i.priceInFull,
    deposit: i.deposit,
    months: 1,
    monthlyRate: 0,
  }).financed

/** 0.48 a year → 0.04 a month (flat). */
export const monthlyRateOf = (annualRate: number) => Math.round((annualRate / 12) * 1e6) / 1e6

/** What the customer pays (or, for 'go4solar', what Go4Solar repays Trade Lenda). */
export type LendingFigures = {
  lendingType: LendingType
  /** The price the 4% is worked on (customer) / the price we quoted (go4solar). */
  price: number
  depositShare: number
  deposit: number
  /** Customer: amount financed by Trade Lenda. Go4Solar: amount drawn from Trade Lenda. */
  financed: number
  monthlyRate: number
  months: number
  /** financed × monthly rate × months. */
  charge: number
  /** Customer: what the customer pays monthly. Go4Solar: what Go4Solar repays monthly. */
  monthly: number
  instalments: number[]
  /** Customer: deposit + financed + charge. Go4Solar: financed + charge (repaid by Go4Solar). */
  totalRepayment: number
  /** 'go4solar' only: what the customer pays us in all, on our quoted terms. */
  customerTotalPayable: number | null
  customerMonthly: number | null
}

/** Trade Lenda lends to the customer. */
export function customerFigures(i: {
  price: number
  depositShare: number
  months: number
  monthlyRate: number
}): LendingFigures {
  const deposit = roundNaira(i.price * i.depositShare)
  const f = funderFinancing({
    kind: 'monthly-rate',
    priceInFull: i.price,
    deposit,
    months: i.months,
    monthlyRate: i.monthlyRate,
  })
  return {
    lendingType: 'customer',
    price: i.price,
    depositShare: i.depositShare,
    deposit,
    financed: f.financed,
    monthlyRate: i.monthlyRate,
    months: i.months,
    charge: f.earnings,
    monthly: f.monthly,
    instalments: f.instalments,
    totalRepayment: deposit + f.totalRepayment,
    customerTotalPayable: null,
    customerMonthly: null,
  }
}

/**
 * Trade Lenda lends to Go4Solar. `quoted`: the customer's figures on our own terms (the price we
 * quoted, its deposit, what they pay in all and monthly). Drawn = price paid in full − deposit.
 */
export function go4solarFigures(i: {
  priceInFull: number
  quoted: {
    price: number
    depositShare: number
    deposit: number
    totalPayable: number
    monthly: number
  }
  months: number
  monthlyRate: number
}): LendingFigures {
  const f = funderFinancing({
    kind: 'monthly-rate',
    priceInFull: i.priceInFull,
    deposit: i.quoted.deposit,
    months: i.months,
    monthlyRate: i.monthlyRate,
  })
  return {
    lendingType: 'go4solar',
    price: i.quoted.price,
    depositShare: i.quoted.depositShare,
    deposit: i.quoted.deposit,
    financed: f.financed,
    monthlyRate: i.monthlyRate,
    months: i.months,
    charge: f.earnings,
    monthly: f.monthly,
    instalments: f.instalments,
    totalRepayment: f.totalRepayment,
    customerTotalPayable: i.quoted.totalPayable,
    customerMonthly: i.quoted.monthly,
  }
}
