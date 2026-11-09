import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { TestDataToggle } from '@/components/admin/TestDataToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireBackOfficeWithMfa } from '@/lib/auth/roles'
import { formatNaira } from '@/lib/money'
import { stateLabel, isNgStateId } from '@/lib/nigeria/states'
import { quoteReference } from '@/lib/quotes/quote'
import { listFilters, quotationStatus, STATUS_LABELS } from '@/lib/staffQuotes/rules'
import { listStaffQuotations, mayCreateQuotations } from '@/lib/staffQuotes/server'
import { includeTestData } from '@/lib/testmode/server'

export const metadata: Metadata = { title: 'Quotations' }
export const dynamic = 'force-dynamic'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const when = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Staff quotations: who made each, when, for whom, the total and the status. */
export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireBackOfficeWithMfa()
  if (!(await mayCreateQuotations(session))) redirect('/admin')
  const sp = await searchParams
  const raw = { staff: one(sp.staff), from: one(sp.from), to: one(sp.to) }
  const f = { ...listFilters(raw), test: await includeTestData(sp.test) }
  const r = await listStaffQuotations(session, f)
  const superAdmin = session.role === 'super_admin'

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-brand-dark text-3xl font-bold">Quotations</h1>
        <Button asChild className="h-11">
          <Link href="/admin/quotations/new" data-testid="new-quotation">
            New quotation
          </Link>
        </Button>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Quotations made by staff with the system builder.{' '}
        {superAdmin ? 'Everyone’s quotations are shown.' : 'Only your own quotations are shown.'}{' '}
        Test data is left out.
      </p>

      <form className="mt-6 flex flex-wrap items-end gap-3" data-testid="quotation-filters">
        {superAdmin && r && (
          <div className="space-y-1">
            <Label htmlFor="staff">Made by</Label>
            <select
              id="staff"
              name="staff"
              defaultValue={f.staff ?? ''}
              className="border-input block h-10 rounded-md border bg-white px-2 text-sm"
            >
              <option value="">Everyone</option>
              {r.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={raw.from} className="h-10" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={raw.to} className="h-10" />
        </div>
        {f.test && <input type="hidden" name="test" value="1" />}
        <Button type="submit" variant="outline" className="h-10">
          Filter
        </Button>
        <TestDataToggle path="/admin/quotations" params={sp} on={f.test} />
      </form>

      {!r ? (
        <p className="bg-brand-mist mt-6 rounded-xl p-4 text-sm">
          Quotations are not available yet (database update 0032 not applied).
        </p>
      ) : r.rows.length === 0 ? (
        <p className="bg-brand-mist mt-6 rounded-xl p-4 text-sm" data-testid="quotations-empty">
          No quotations yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm" data-testid="quotations-table">
            <thead className="bg-brand-green text-left text-white">
              <tr>
                {['Reference', 'Made', 'By', 'Customer', 'State', 'Total', 'Status'].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((q, i) => (
                <tr
                  key={q.id}
                  className={i % 2 ? 'bg-brand-mist/60' : ''}
                  data-testid="quotation-row"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/admin/quotations/${q.id}`} className="text-brand-blue underline">
                      {quoteReference(q.id)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {when.format(new Date(q.created_at))}
                  </td>
                  <td className="px-3 py-2">{q.createdByName ?? '—'}</td>
                  <td className="px-3 py-2">
                    {q.customer_name ?? '—'}
                    {q.customer_phone && (
                      <span className="text-muted-foreground block text-xs">
                        {q.customer_phone}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isNgStateId(q.state) ? stateLabel(q.state) : q.state}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {q.sample ? 'Sample prices' : formatNaira(Number(q.total))}
                  </td>
                  <td className="px-3 py-2">{STATUS_LABELS[quotationStatus(q)]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
