export type ScheduleRow = { n: number; dueDate: string; amount: number }

const LAGOS_OFFSET_MS = 60 * 60 * 1000 // Africa/Lagos is UTC+1 all year (no daylight saving)

/** YYYY-MM-DD of `start` in Lagos, moved forward `months` months (31 Jan + 1 → 28/29 Feb). */
function addMonthsLagos(start: Date, months: number): string {
  const local = new Date(start.getTime() + LAGOS_OFFSET_MS)
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const d = Math.min(local.getUTCDate(), lastDay)
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
}

/**
 * Monthly repayment rows from the quote's instalments (they already sum to the balance; the last
 * one absorbs rounding). The first payment falls one month after `start`.
 */
export function buildSchedule(instalments: number[], start: Date): ScheduleRow[] {
  return instalments.map((amount, i) => ({
    n: i + 1,
    dueDate: addMonthsLagos(start, i + 1),
    amount,
  }))
}
