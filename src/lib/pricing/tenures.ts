import { TENURES, type RateByTenure, type TenureMonths } from './types'

/** Tenures every estimate made before 18/24 months existed was priced for. */
const LEGACY_TENURES: TenureMonths[] = [3, 6, 9, 12]

/** Waiting-list estimates are priced at 12 months, so 12 months always stays on. */
export const ESTIMATE_TENURE: TenureMonths = 12

/**
 * Highest share of the cost the financing may add: f × (1 − d) below 0.75 keeps the price under
 * 4× the cost. Above it a long tenure would make the price run away.
 */
export const MAX_FINANCED_SHARE = 0.75

const isTenure = (n: number): n is TenureMonths => (TENURES as readonly number[]).includes(n)

/**
 * The tenures a customer may choose for an estimate: those the estimate captured a rate for
 * (its snapshot), minus any switched off since (`enabledNow`). Never empty; shortest first.
 */
export function offeredTenures(
  rates: RateByTenure | undefined,
  enabledNow?: readonly TenureMonths[],
): TenureMonths[] {
  if (!rates) return LEGACY_TENURES
  const captured = Object.keys(rates)
    .map(Number)
    .filter(isTenure)
    .sort((a, b) => a - b)
  if (!enabledNow) return captured
  const still = captured.filter((t) => enabledNow.includes(t))
  return still.length > 0 ? still : captured
}

/** The "f" in P = C / (1 − f(1 − d)): the yearly pricing rate times the years. */
export function financedShare(rateAnnual: number, months: TenureMonths): number {
  return (rateAnnual * months) / 12
}

export type TenureRateRow = {
  tenureMonths: TenureMonths
  enabled: boolean
  expectedFunderRate: number | null
  spread: number | null
  defaultBuffer: number | null
}

/** What stops one tenure row from being saved, in plain words; null when it is fine. */
export function tenureRateProblem(row: TenureRateRow, minDepositShare: number): string | null {
  if (!row.enabled) return null
  const { expectedFunderRate: a, spread: b, defaultBuffer: c } = row
  if (a === null || b === null || c === null) {
    return `${row.tenureMonths} months: enter the funder rate, spread and buffer before switching it on.`
  }
  const rate = a + b + c
  if (financedShare(rate, row.tenureMonths) * (1 - minDepositShare) >= MAX_FINANCED_SHARE) {
    return `${row.tenureMonths} months: a ${Math.round(rate * 100)}% yearly rate is too high for this length (the price would be more than ${Math.round(1 / (1 - MAX_FINANCED_SHARE))}× the cost). Lower the rate.`
  }
  return null
}

/** Rules for the whole list. */
export function tenureListProblem(
  rows: { tenureMonths: TenureMonths; enabled: boolean }[],
): string | null {
  const twelve = rows.find((r) => r.tenureMonths === ESTIMATE_TENURE)
  if (!twelve?.enabled) return '12 months must stay switched on: estimates are priced at 12 months.'
  return null
}

/** "3, 6, 9 or 12 months": the lengths a customer can choose, for FAQ and page text. */
export function tenureListText(tenures: readonly TenureMonths[]): string {
  const sorted = [...tenures].sort((a, b) => a - b)
  if (sorted.length <= 1) return `${sorted[0] ?? ESTIMATE_TENURE} months`
  return `${sorted.slice(0, -1).join(', ')} or ${sorted[sorted.length - 1]} months`
}
