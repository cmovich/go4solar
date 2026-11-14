import { roundNaira } from '@/lib/money'

import type { LoanProfit } from './types'

/**
 * Profit of a plan paid in full: a one-off sale. Nothing is drawn from a funder, there are no
 * monthly payments (so no instalment fees, no loss provision, nothing per month to come); the
 * payment provider's fee is the only direct cost.
 */
export function fullPaymentProfit(i: {
  systemPrice: number
  costPrice: number
  fees: number
}): LoanProfit {
  const grossProfit = roundNaira(i.systemPrice - i.costPrice)
  const directCosts = roundNaira(i.fees)
  return {
    drawn: 0,
    funderInterest: 0,
    grossProfit,
    directCosts,
    netProfit: grossProfit - directCosts,
    netPerMonth: 0,
    customerMonthly: 0,
    funderMonthly: 0,
    annualReturnOnDrawn: null,
  }
}
