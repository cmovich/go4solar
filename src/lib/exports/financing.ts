import { funderFinancing } from '@/lib/funders/financing'
import { roundNaira } from '@/lib/money'
import { monthlyRateOf, type LendingType } from '@/lib/tradeLenda/figures'
import type { PlanBasis } from '@/lib/tradeLenda/planBasis'

/**
 * The financing figures every export carries, per person (Basic and Full alike; pure). Built on
 * `funderFinancing()` so a funder's figures match its balance, drawn amount and interest exactly.
 *
 * - Trade Lenda: financed = price paid in full − deposit; earnings = financed × 4% × months
 *   (both lending types draw the same amount).
 * - SPEWA (business offer quote): financed = price − deposit; earnings = the payment plan charge.
 * - Any other funder (and SPEWA without an offer charge): its own yearly rate, flat.
 *
 * Earnings are ONLY the funder's interest or charge on what it finances, never our margin or
 * profit.
 */
export type FunderTerms =
  | { kind: 'trade-lenda'; monthlyRate: number; lendingType: LendingType }
  | { kind: 'spewa'; annualRate: number }
  | { kind: 'rate'; annualRate: number }

export type ExportFinancing = {
  months: number
  deposit: number
  depositStatus: 'paid' | 'to be paid'
  /** Deposit paid so far (successful payments). */
  depositPaid: number
  financed: number
  monthly: number
  /** financed + earnings: repaid over the months. */
  totalRepayment: number
  /** The funder's interest or charge on what it finances. */
  earnings: number
}

export function exportFinancing(
  basis: PlanBasis,
  terms: FunderTerms,
  input: { depositShare: number; months: number; depositPaid: number },
): ExportFinancing {
  const deposit =
    terms.kind === 'trade-lenda' && terms.lendingType === 'customer'
      ? roundNaira(basis.priceInFull * input.depositShare)
      : basis.quoted.deposit
  const f =
    terms.kind === 'spewa' && basis.planCharge
      ? funderFinancing({
          kind: 'charge',
          price: basis.priceInFull,
          deposit,
          charge: basis.planCharge,
          months: input.months,
        })
      : funderFinancing({
          kind: 'monthly-rate',
          priceInFull: basis.priceInFull,
          deposit,
          months: input.months,
          monthlyRate:
            terms.kind === 'trade-lenda' ? terms.monthlyRate : monthlyRateOf(terms.annualRate),
        })
  return {
    months: input.months,
    deposit,
    depositStatus: input.depositPaid >= deposit && deposit > 0 ? 'paid' : 'to be paid',
    depositPaid: input.depositPaid,
    financed: f.financed,
    monthly: f.monthly,
    totalRepayment: f.totalRepayment,
    earnings: f.earnings,
  }
}

/** A batch's financing summary (first page of the PDF, the totals row, the dashboard header). */
export function exportTotals(people: { level: 'basic' | 'full'; financing: ExportFinancing }[]) {
  const sum = (f: (x: ExportFinancing) => number) => people.reduce((s, p) => s + f(p.financing), 0)
  return {
    people: people.length,
    basic: people.filter((p) => p.level === 'basic').length,
    full: people.filter((p) => p.level === 'full').length,
    depositsPaid: sum((f) => Math.min(f.depositPaid, f.deposit)),
    depositsToPay: sum((f) => Math.max(0, f.deposit - f.depositPaid)),
    financed: sum((f) => f.financed),
    totalRepayment: sum((f) => f.totalRepayment),
    earnings: sum((f) => f.earnings),
    monthly: sum((f) => f.monthly),
  }
}
export type ExportTotals = ReturnType<typeof exportTotals>
