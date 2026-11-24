import { roundNaira } from '@/lib/money'

/**
 * What a funder finances and earns on one customer (pure; the ONE function for every funder —
 * balances, drawn amounts, interest, exports and batch totals all read it).
 *
 * - 'monthly-rate' (Trade Lenda, flat): financed = price paid in full − deposit;
 *   earnings = financed × monthly rate × months.
 * - 'charge' (SPEWA offer): financed = price − deposit; earnings = the payment plan charge.
 *
 * The funder's earnings are ONLY its interest or charge on what it finances: never our equipment
 * or installation margin, never our profit.
 */
export type FunderFinancingInput =
  | {
      kind: 'monthly-rate'
      priceInFull: number
      deposit: number
      months: number
      monthlyRate: number
    }
  | { kind: 'charge'; price: number; deposit: number; charge: number; months: number }

export type FunderFinancing = {
  months: number
  deposit: number
  /** What the funder hands over (never below 0). */
  financed: number
  /** The funder's interest or charge on what it finances. */
  earnings: number
  /** financed + earnings: what is repaid over the months. */
  totalRepayment: number
  monthly: number
  instalments: number[]
}

/** Equal monthly payments to the naira; the last one takes the rounding. */
export function splitMonthly(total: number, months: number) {
  const monthly = roundNaira(total / months)
  return {
    monthly,
    instalments: Array.from({ length: months }, (_, i) =>
      i === months - 1 ? total - monthly * (months - 1) : monthly,
    ),
  }
}

export function funderFinancing(i: FunderFinancingInput): FunderFinancing {
  const financed = Math.max(0, (i.kind === 'monthly-rate' ? i.priceInFull : i.price) - i.deposit)
  const earnings =
    i.kind === 'monthly-rate' ? roundNaira(financed * i.monthlyRate * i.months) : i.charge
  const totalRepayment = financed + earnings
  return {
    months: i.months,
    deposit: i.deposit,
    financed,
    earnings,
    totalRepayment,
    ...splitMonthly(totalRepayment, i.months),
  }
}
