/**
 * Admin → Trade Lenda profiles, the list (pure): every real waiting-list entry, complete sign-up
 * or not, with where it stands, the filters (with counts), search and sort.
 */
export type ListStatus = 'not_started' | 'incomplete' | 'ready' | 'sent' | 'decided'
export const LIST_FILTERS = [
  'all',
  'not_started',
  'incomplete',
  'ready',
  'sent',
  'decided',
] as const
export type ListFilter = (typeof LIST_FILTERS)[number]
export const FILTER_LABELS: Record<ListFilter, string> = {
  all: 'All',
  not_started: 'Not started',
  incomplete: 'Incomplete',
  ready: 'Ready to send',
  sent: 'Sent',
  decided: 'Trade Lenda decided',
}
export const STATUS_LABELS: Record<ListStatus, string> = {
  not_started: 'Not started',
  incomplete: 'Incomplete',
  ready: 'Ready to send',
  sent: 'Sent',
  decided: 'Trade Lenda decided',
}
export type ListSort = 'newest' | 'oldest' | 'complete'

export type ListFacts = {
  hasProfile: boolean
  missing: number
  verified: boolean
  consent: boolean
  agreed: boolean
  /** In a current (not replaced) batch. */
  sent: boolean
  /** Trade Lenda decided (approved, declined or needs info) in a current batch. */
  decided: boolean
}

/** Where an entry stands: decided > sent > ready > incomplete > not started. */
export function statusOf(f: ListFacts): ListStatus {
  if (f.decided) return 'decided'
  if (f.sent) return 'sent'
  if (f.missing === 0 && f.verified && f.consent && f.agreed) return 'ready'
  return f.hasProfile ? 'incomplete' : 'not_started'
}

type Row = {
  name: string
  phone: string
  email: string | null
  createdAt: string
  done: number
  total: number
  status: ListStatus
}

const digits = (s: string) => s.replace(/\D/g, '')

/** Search by name, phone (any format: 0803…, +234803…) or email. */
export function matchesSearch(r: Row, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  const d = digits(t)
  const phone = digits(r.phone)
  return (
    r.name.toLowerCase().includes(t) ||
    (r.email ?? '').toLowerCase().includes(t) ||
    (d.length >= 4 && (phone.includes(d) || phone.includes(d.replace(/^0/, '234'))))
  )
}

export function filterCounts<T extends Row>(rows: T[]): Record<ListFilter, number> {
  const out = Object.fromEntries(LIST_FILTERS.map((f) => [f, 0])) as Record<ListFilter, number>
  out.all = rows.length
  for (const r of rows) out[r.status] += 1
  return out
}

export function listRows<T extends Row>(
  rows: T[],
  o: { filter: ListFilter; q: string; sort: ListSort },
): T[] {
  const kept = rows.filter(
    (r) => (o.filter === 'all' || r.status === o.filter) && matchesSearch(r, o.q),
  )
  return [...kept].sort((a, b) =>
    o.sort === 'oldest'
      ? a.createdAt.localeCompare(b.createdAt)
      : o.sort === 'complete'
        ? b.done / b.total - a.done / a.total || b.createdAt.localeCompare(a.createdAt)
        : b.createdAt.localeCompare(a.createdAt),
  )
}
