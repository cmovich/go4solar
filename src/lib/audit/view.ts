/** Pure helpers for the /admin/audit page and its CSV export. */

export type AuditChange = { field: string; before: unknown; after: unknown }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const IGNORED = new Set(['id', 'updated_at', 'created_at'])

/** The fields that changed between before and after (both may be null, objects or plain values). */
export function auditDiff(before: unknown, after: unknown): AuditChange[] {
  if (!isObject(before) && !isObject(after)) {
    return JSON.stringify(before) === JSON.stringify(after)
      ? []
      : [{ field: '(value)', before: before ?? undefined, after: after ?? undefined }]
  }
  const b = isObject(before) ? before : {}
  const a = isObject(after) ? after : {}
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !IGNORED.has(k))
  return keys
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ field: k, before: b[k], after: a[k] }))
}

/** Plain words for automatic entries; app entries keep their own action name. */
export function describeAction(action: string, entity: string): string {
  if (action === 'db.insert') return `Added to ${entity}`
  if (action === 'db.update') return `Changed ${entity}`
  if (action === 'db.delete') return `Deleted from ${entity}`
  if (action === 'auth.sign_in') return 'Signed in'
  if (action === 'auth.sign_out') return 'Signed out'
  if (action === 'auth.two_factor') return 'Passed two-factor check'
  if (action === 'waitlist.delete') return 'Deleted a waiting-list entry'
  if (action === 'waitlist.delete_test') return 'Deleted all test entries'
  return action
}

/** Deletions keep the whole old row: the page shows it in full so it can be restored. */
export function deletedRow(action: string, before: unknown): Record<string, unknown> | null {
  if (action !== 'db.delete' && action !== 'waitlist.delete') return null
  return isObject(before) ? before : null
}

export type AuditRow = {
  created_at: string
  actor_email: string | null
  actor_role: string | null
  action: string
  entity: string
  entity_id: string | null
  source: string
  before: unknown
  after: unknown
}

const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v))

/** One CSV cell: quoted, and never starting a spreadsheet formula. */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function auditCsv(rows: AuditRow[]): string {
  const header = ['When (Lagos)', 'Who', 'Role', 'Action', 'Table', 'Row', 'Source', 'Changes']
  const lines = rows.map((r) =>
    [
      new Date(r.created_at).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' }),
      r.actor_email ?? 'system',
      r.actor_role,
      r.action,
      r.entity,
      r.entity_id,
      r.source,
      auditDiff(r.before, r.after)
        .map((c) => `${c.field}: ${show(c.before)} → ${show(c.after)}`)
        .join('; '),
    ]
      .map(cell)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n') + '\n'
}

export type AuditFilters = {
  who: string | null
  fromIso: string | null
  toIso: string | null
  table: string | null
  action: string | null
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const NAME = /^[a-z_.]{1,60}$/

/** Filters from the page address; dates are whole days in Lagos time (UTC+1). */
export function parseAuditFilters(p: Record<string, string | string[] | undefined>): AuditFilters {
  const who = one(p.who)
  const from = one(p.from)
  const to = one(p.to)
  const table = one(p.table)
  const action = one(p.action)
  return {
    who: who && UUID.test(who) ? who : null,
    fromIso: from && DAY.test(from) ? `${from}T00:00:00+01:00` : null,
    toIso: to && DAY.test(to) ? `${to}T23:59:59.999+01:00` : null,
    table: table && NAME.test(table) ? table : null,
    action: action && NAME.test(action) ? action : null,
  }
}
