import { roundNaira } from '@/lib/money'

import type { LoanProfit, LoanProfitInput } from './types'

/**
 * Go4Solar's side of one loan (PRD "What the system calculates for every loan").
 * Funder interest is charged on the money actually drawn (cost price − deposit), never on the
 * customer's balance. Runs at Quoted, Approved and Actual with different inputs.
 */
export function loanProfit(input: LoanProfitInput): LoanProfit {
  const { systemPrice, costPrice, deposit, tenureMonths, funderAnnualRate, unitCosts } = input
  const years = tenureMonths / 12

  // A deposit above the cost price means nothing is borrowed; never go negative.
  const drawn = Math.max(0, costPrice - deposit)
  // Only 'flat' is supported in Phase 1 (interest on the full drawn amount for the whole term).
  const funderInterest = roundNaira(drawn * funderAnnualRate * years)

  const grossProfit = systemPrice - costPrice - funderInterest

  const financedBalance = systemPrice - deposit
  const directCosts =
    unitCosts.kycPerLoan +
    unitCosts.feePerInstalment * tenureMonths +
    roundNaira(unitCosts.lossProvisionShare * financedBalance)

  const netProfit = grossProfit - directCosts

  return {
    drawn,
    funderInterest,
    grossProfit,
    directCosts,
    netProfit,
    netPerMonth: roundNaira(netProfit / tenureMonths),
    customerMonthly: roundNaira(financedBalance / tenureMonths),
    funderMonthly: roundNaira((drawn + funderInterest) / tenureMonths),
    // Return on the funder's money, annualised. Undefined when nothing is drawn (shown as "—").
    annualReturnOnDrawn: drawn > 0 ? (netProfit / drawn) * (12 / tenureMonths) : null,
  }
}
