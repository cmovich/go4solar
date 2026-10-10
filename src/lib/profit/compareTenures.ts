import { priceQuote } from '@/lib/pricing/price'
import type { QuoteInput, QuoteResult, TenureMonths } from '@/lib/pricing/types'

import { loanProfit } from './loanProfit'
import type { FunderMethod, LoanProfit, UnitCosts } from './types'

export type CompareTenuresInput = {
  /** The quote to re-price per tenure; its own tenureMonths is ignored. */
  quote: Omit<QuoteInput, 'tenureMonths'> & { tenureMonths?: TenureMonths }
  funderAnnualRate: number
  funderMethod: FunderMethod
  unitCosts: UnitCosts
}

/** One row of the PRD's "Which repayment plans make more money" table. */
export type TenureComparisonRow = {
  tenureMonths: TenureMonths
  systemPrice: number
  monthly: number
  netProfit: number
  netPerMonth: number
  annualReturnOnDrawn: number | null
  quote: QuoteResult
  profit: LoanProfit
}

/** Price the same system at each tenure and show Go4Solar's profit per customer and per naira drawn. */
export function compareTenures(
  base: CompareTenuresInput,
  tenures: readonly TenureMonths[],
): TenureComparisonRow[] {
  return tenures.map((tenureMonths) => {
    const quote = priceQuote({ ...base.quote, tenureMonths })
    const profit = loanProfit({
      systemPrice: quote.systemPrice,
      costPrice: quote.costPrice,
      deposit: quote.deposit,
      tenureMonths,
      funderAnnualRate: base.funderAnnualRate,
      funderMethod: base.funderMethod,
      unitCosts: base.unitCosts,
    })
    return {
      tenureMonths,
      systemPrice: quote.systemPrice,
      monthly: quote.monthly,
      netProfit: profit.netProfit,
      netPerMonth: profit.netPerMonth,
      annualReturnOnDrawn: profit.annualReturnOnDrawn,
      quote,
      profit,
    }
  })
}
