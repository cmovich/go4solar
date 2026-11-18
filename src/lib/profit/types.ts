import type { TenureMonths } from '@/lib/pricing/types'

/** Per-loan running costs set by admin (unit_costs). */
export type UnitCosts = {
  /** KYC and verification for customer + guarantor, per loan. */
  kycPerLoan: number
  /** Payment / direct-debit fee per instalment. */
  feePerInstalment: number
  /** Expected loss provision as a share of the financed balance (0.02 = 2%). */
  lossProvisionShare: number
}

export type FunderMethod = 'flat'

export type LoanProfitInput = {
  systemPrice: number
  costPrice: number
  deposit: number
  tenureMonths: TenureMonths
  /** What this funder charges Go4Solar per year (0 for own fund). */
  funderAnnualRate: number
  funderMethod: FunderMethod
  unitCosts: UnitCosts
  /**
   * How the funder lends (Trade Lenda, 0041). Missing: the old way (drawn = cost − deposit).
   * 'go4solar': the funder lends to Go4Solar; drawn = the customer's amount financed
   * (`customerFinanced`), never a figure based on our cost. 'customer': the funder lends to the
   * customer and pays Go4Solar the price upfront (`systemPrice` = that price): no funder interest,
   * and the funder collects the payments (no instalment fees or loss provision for us).
   */
  lendingType?: 'customer' | 'go4solar'
  /** 'go4solar' only: the customer's amount financed (price − deposit). */
  customerFinanced?: number
}

export type LoanProfit = {
  /** Money drawn from the funder: max(0, costPrice − deposit). */
  drawn: number
  funderInterest: number
  /** systemPrice − costPrice − funderInterest. */
  grossProfit: number
  /** KYC + instalment fees + loss provision. */
  directCosts: number
  netProfit: number
  netPerMonth: number
  customerMonthly: number
  funderMonthly: number
  /** Net profit ÷ drawn, annualised. null when nothing is drawn (shown as "—"). */
  annualReturnOnDrawn: number | null
}
