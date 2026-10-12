import type { Metadata } from 'next'
import Link from 'next/link'

import { TestDataToggle, showTestFrom } from '@/components/admin/TestDataToggle'
import { applicationQueue, QUEUE_FLAGS, type QueueFlag } from '@/lib/approvals/admin'
import { requireRole } from '@/lib/auth/roles'
import { formatNaira } from '@/lib/money'
import { NG_STATE_IDS, stateLabel } from '@/lib/nigeria/states'

export const metadata: Metadata = { title: 'Applications' }
export const dynamic = 'force-dynamic'

const STATUSES = [
  'submitted',
  'under_review',
  'more_info',
  'approved',
  'declined',
  'draft',
] as const
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  more_info: 'More info asked',
  approved: 'Approved',
  declined: 'Declined',
}
const select = 'border-input h-10 rounded-md border bg-white px-2 text-sm'

/** The applications queue: filters, 48-hour decision timer, flags. */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    state?: string
    type?: string
    flag?: string
    awaiting?: string
    test?: string
  }>
}) {
  await requireRole('super_admin', 'credit_officer')
  const sp = await searchParams
  const flag = sp.flag && sp.flag in QUEUE_FLAGS ? (sp.flag as QueueFlag) : undefined
  const rows = await applicationQueue({
    status: sp.status || undefined,
    state: sp.state || undefined,
    type: sp.type || undefined,
    flag,
    awaiting: sp.awaiting === '1',
    includeTest: showTestFrom(sp.test),
  })

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-brand-dark text-3xl font-bold">Applications</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Decide within 48 hours of submission.
          </p>
          <div className="mt-2">
            <TestDataToggle path="/admin/applications" params={sp} on={showTestFrom(sp.test)} />
          </div>
        </div>
        <Link
          href="/admin/applications/new"
          className="bg-brand-green hover:bg-brand-dark rounded-md px-4 py-2 text-sm font-semibold text-white"
        >
          New application on behalf of customer
        </Link>
      </div>

      <form className="mt-6 flex flex-wrap items-end gap-2" method="get">
        <select name="status" defaultValue={sp.status ?? ''} className={select} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select name="state" defaultValue={sp.state ?? ''} className={select} aria-label="State">
          <option value="">All states</option>
          {NG_STATE_IDS.map((id) => (
            <option key={id} value={id}>
              {stateLabel(id)}
            </option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={sp.type ?? ''}
          className={select}
          aria-label="Applicant type"
        >
          <option value="">Homes and businesses</option>
          <option value="individual">Homes</option>
          <option value="business">Businesses</option>
        </select>
        <select name="flag" defaultValue={sp.flag ?? ''} className={select} aria-label="Flag">
          <option value="">Any flags</option>
          {Object.entries(QUEUE_FLAGS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="awaiting" value="1" defaultChecked={sp.awaiting === '1'} />{' '}
          Awaiting customer
        </label>
        {showTestFrom(sp.test) && <input type="hidden" name="test" value="1" />}
        <button
          type="submit"
          className="bg-brand-dark h-10 rounded-md px-4 text-sm font-semibold text-white"
        >
          Filter
        </button>
      </form>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm" data-testid="applications-queue">
          <thead>
            <tr className="bg-brand-green text-left text-white">
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">System price</th>
              <th className="px-3 py-2">Decision due</th>
              <th className="px-3 py-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="even:bg-brand-mist">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/applications/${r.id}`}
                    className="text-brand-blue font-semibold underline"
                  >
                    {r.name || 'Unnamed'}
                  </Link>
                  <span className="text-muted-foreground block text-xs">
                    {r.reference} · {r.type === 'business' ? 'Business' : 'Home'}
                    {r.enteredBy ? ` · Entered by ${r.enteredBy}` : ''}
                  </span>
                </td>
                <td className="px-3 py-2">{r.state ?? '—'}</td>
                <td className="px-3 py-2">
                  {r.awaitingCustomer ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      Awaiting customer
                    </span>
                  ) : (
                    STATUS_LABEL[r.status]
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.systemPrice ? formatNaira(r.systemPrice) : '—'}
                </td>
                <td className="px-3 py-2">
                  {r.sla ? (
                    <span
                      data-testid="sla"
                      className={`font-semibold ${r.sla.overdue ? 'text-red-700' : r.sla.hoursLeft < 12 ? 'text-amber-700' : ''}`}
                    >
                      {r.sla.overdue
                        ? `Overdue by ${-r.sla.hoursLeft} h`
                        : `${r.sla.hoursLeft} h left`}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.flags.map((f) => (
                      <span
                        key={f}
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
                      >
                        {QUEUE_FLAGS[f]}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-3 py-6 text-center">
                  Nothing matches these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
