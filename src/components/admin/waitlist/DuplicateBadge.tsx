import type { DuplicateMatch } from '@/lib/waitlist/duplicates'

/** "Possible duplicate": phone or email matches another entry (hover / long-press for which). */
export function DuplicateBadge({ match }: { match: DuplicateMatch | undefined }) {
  if (!match) return null
  const on = [match.phone.length ? 'phone' : null, match.email.length ? 'email' : null]
    .filter(Boolean)
    .join(' and ')
  const others = new Set([...match.phone, ...match.email]).size
  return (
    <span
      className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs whitespace-nowrap text-amber-900"
      title={`Same ${on} as ${others} other ${others === 1 ? 'entry' : 'entries'}`}
      data-testid="possible-duplicate"
    >
      Possible duplicate
    </span>
  )
}
