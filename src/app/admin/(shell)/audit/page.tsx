import type { Metadata } from 'next'
import Link from 'next/link'

import { requireRole, STAFF_ROLES } from '@/lib/auth/roles'
import { AUDIT_PAGE_LIMIT, AUDIT_TABLES, auditEntries } from '@/lib/audit/server'
import { auditDiff, describeAction, parseAuditFilters } from '@/lib/audit/view'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Audit log' }
export const dynamic = 'force-dynamic'

const date = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'medium',
  })

const show = (v: unknown) => {
  if (v === undefined || v === null) return '—'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 120 ? `${s.slice(0, 117)}…` : s
}

const field = 'border-input h-10 rounded-md border bg-white px-2 text-sm'

/**
 * Super admin only. Every change by any staff member, recorded by the database itself (and by the
 * app for business events), plus staff sign-ins and sign-outs. Permanent: nothing here can be
 * edited or deleted.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRole('super_admin')
  const params = await searchParams
  const filters = parseAuditFilters(params)
  const [rows, staff] = await Promise.all([
    auditEntries(filters, AUDIT_PAGE_LIMIT),
    (await createClient())
      .from('profiles')
      .select('id, email, full_name, role')
      .in('role', [...STAFF_ROLES])
      .order('email'),
  ])
  const qs = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' && v ? [[k, v]] : [])),
  ).toString()
  const value = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '')

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Audit log</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Every change made by staff, recorded automatically, plus staff sign-ins and sign-outs. The
        log is permanent: entries can never be edited or deleted.
      </p>

      <form
        method="get"
        className="bg-brand-mist mt-6 flex flex-wrap items-end gap-3 rounded-xl p-4"
      >
        <label className="text-xs">
          Person
          <select name="who" defaultValue={value('who')} className={`${field} mt-1 block`}>
            <option value="">Everyone</option>
            {(staff.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ? `${p.full_name} (${p.email})` : p.email}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          From
          <input
            type="date"
            name="from"
            defaultValue={value('from')}
            className={`${field} mt-1 block`}
          />
        </label>
        <label className="text-xs">
          To
          <input
            type="date"
            name="to"
            defaultValue={value('to')}
            className={`${field} mt-1 block`}
          />
        </label>
        <label className="text-xs">
          Table
          <select name="table" defaultValue={value('table')} className={`${field} mt-1 block`}>
            <option value="">All tables</option>
            {AUDIT_TABLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Action
          <select name="action" defaultValue={value('action')} className={`${field} mt-1 block`}>
            <option value="">All actions</option>
            <option value="db.insert">Added</option>
            <option value="db.update">Changed</option>
            <option value="db.delete">Deleted</option>
            <option value="auth.">Sign-ins and sign-outs</option>
            <option value="pricing.">Pricing (app)</option>
            <option value="staff.">Staff (app)</option>
            <option value="application.">Applications (app)</option>
            <option value="job.">Jobs (app)</option>
          </select>
        </label>
        <button
          type="submit"
          className="bg-brand-green h-10 rounded-md px-4 text-sm font-semibold text-white"
        >
          Show
        </button>
        <Link
          href="/admin/audit"
          className="text-brand-blue h-10 px-2 text-sm leading-10 underline"
        >
          Clear
        </Link>
        <a
          href={`/api/admin/audit.csv${qs ? `?${qs}` : ''}`}
          className="ml-auto h-10 rounded-md border bg-white px-4 text-sm leading-10 font-semibold"
          data-testid="audit-csv"
        >
          Download CSV
        </a>
      </form>

      <p className="text-muted-foreground mt-4 text-xs">
        {rows.length === AUDIT_PAGE_LIMIT
          ? `Showing the newest ${AUDIT_PAGE_LIMIT} matching entries; narrow the filters or download the CSV for more.`
          : `${rows.length} matching ${rows.length === 1 ? 'entry' : 'entries'}, newest first.`}
      </p>

      <div className="mt-2 overflow-x-auto rounded-xl border">
        <table className="w-full text-sm" data-testid="audit-table">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              {['When (Lagos)', 'Who', 'What', 'Row', 'Before → after'].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const changes = auditDiff(r.before, r.after)
              return (
                <tr key={r.id} className={`align-top ${i % 2 ? 'bg-brand-mist/60' : 'bg-white'}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{date(r.created_at)}</td>
                  <td className="px-3 py-2">
                    {r.actor_email ?? (r.actor_id ? r.actor_id : 'system')}
                    {r.actor_role && (
                      <span className="text-muted-foreground block text-xs">{r.actor_role}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {describeAction(r.action, r.entity)}
                    <span className="text-muted-foreground block font-mono text-xs">
                      {r.action} · {r.source === 'trigger' ? 'database' : r.source}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.entity}
                    {r.entity_id && (
                      <span className="text-muted-foreground block break-all">{r.entity_id}</span>
                    )}
                  </td>
                  <td className="max-w-xl px-3 py-2">
                    {changes.length === 0 ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <ul className="space-y-0.5 text-xs">
                        {changes.slice(0, 12).map((c) => (
                          <li key={c.field} className="break-words">
                            <span className="font-semibold">{c.field}</span>:{' '}
                            <span className="text-red-800 line-through decoration-red-300">
                              {show(c.before)}
                            </span>{' '}
                            → <span className="text-brand-green font-medium">{show(c.after)}</span>
                          </li>
                        ))}
                        {changes.length > 12 && (
                          <li className="text-muted-foreground">
                            and {changes.length - 12} more fields (see the CSV)
                          </li>
                        )}
                      </ul>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-3 py-6 text-center">
                  No entries match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
