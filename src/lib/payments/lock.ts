/**
 * Remote-lock rule (setting lock_after_days_overdue, 7 by default): an active plan is due to be
 * locked once its oldest unpaid payment is that many days overdue. An approved extension pauses
 * the lock until the extension's last day (inclusive). Phase 1 only reports "Lock due"; the actual
 * remote lock (lock-capable inverters) is Phase 2 and must use this same rule. Pure: no database.
 */
export type LockInput = {
  schedule: { dueDate: string; amount: number; paidAmount: number }[]
  /** Today's Lagos date, YYYY-MM-DD. */
  today: string
  lockAfterDays: number
  /** Last day of an approved extension (YYYY-MM-DD), or null. */
  extensionUntil: string | null
  /** Only active plans (installed, being repaid) can be locked. */
  active: boolean
}

export type LockState = {
  daysOverdue: number
  lockDue: boolean
  /** The day the lock becomes due, while a payment is overdue but not yet past the limit. */
  lockDate: string | null
  /** Set while an approved extension is pausing the lock. */
  pausedUntil: string | null
}

/** Today's date in Lagos (UTC+1, no daylight saving), YYYY-MM-DD. */
export const lagosDate = (now: Date = new Date()) =>
  new Date(now.getTime() + 3_600_000).toISOString().slice(0, 10)

const DAY = 86_400_000
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
/** A YYYY-MM-DD date plus n days. */
export const addDaysIso = (d: string, n: number) =>
  new Date(toMs(d) + n * DAY).toISOString().slice(0, 10)

export function lockStatus(input: LockInput): LockState {
  const oldest = input.schedule
    .filter((r) => r.paidAmount < r.amount && r.dueDate < input.today)
    .map((r) => r.dueDate)
    .sort()[0]
  if (!oldest) return { daysOverdue: 0, lockDue: false, lockDate: null, pausedUntil: null }

  const daysOverdue = Math.round((toMs(input.today) - toMs(oldest)) / DAY)
  const pausedUntil =
    input.extensionUntil && input.extensionUntil >= input.today ? input.extensionUntil : null
  const past = daysOverdue >= input.lockAfterDays
  return {
    daysOverdue,
    lockDue: input.active && past && !pausedUntil,
    lockDate: past ? null : addDaysIso(oldest, input.lockAfterDays),
    pausedUntil,
  }
}

/** Longest extension the agreement allows (clause 6: one extension of up to 30 days). */
export const MAX_EXTENSION_DAYS = 30

/** Why an extension to `until` cannot be approved, or null when it can. */
export function extensionProblem(input: {
  until: string
  today: string
  alreadyGranted: boolean
  active: boolean
}): string | null {
  if (!input.active) return 'Extensions are only for active plans (installed and being repaid).'
  if (input.alreadyGranted) return 'This plan has already had its one extension.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.until) || input.until <= input.today)
    return 'Choose an end date after today.'
  if (input.until > addDaysIso(input.today, MAX_EXTENSION_DAYS))
    return `An extension can last at most ${MAX_EXTENSION_DAYS} days.`
  return null
}
