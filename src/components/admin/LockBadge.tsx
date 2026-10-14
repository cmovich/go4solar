import type { LockState } from '@/lib/payments/lock'

const day = (iso: string) =>
  new Date(`${iso}T12:00:00+01:00`).toLocaleDateString('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

/** "Lock due" once a payment is past the lock limit; "Extension to …" while one pauses it. */
export function LockBadge({ lock }: { lock: LockState }) {
  if (lock.lockDue) {
    return (
      <span className="ml-2 inline-block rounded-full bg-red-700 px-2 py-0.5 text-xs font-semibold text-white">
        Lock due
      </span>
    )
  }
  if (lock.pausedUntil && lock.daysOverdue > 0) {
    return (
      <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
        Extension to {day(lock.pausedUntil)}
      </span>
    )
  }
  return null
}
