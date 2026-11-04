import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { TestDataToggle } from '@/components/admin/TestDataToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireStaffWithMfa } from '@/lib/auth/roles'
import type { GridRow } from '@/lib/grid/insights'
import { GRID_INSIGHT_ROLES, loadGridInsights } from '@/lib/grid/server'
import { formatPercent } from '@/lib/money'
import { includeTestData } from '@/lib/testmode/server'

export const metadata: Metadata = { title: 'Grid insights' }
export const dynamic = 'force-dynamic'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const hrs = (n: number | null) => (n === null ? '—' : `${n} h`)
const share = (s: number | null) => (s === null ? '—' : formatPercent(s, 0))
const modeShare = (r: GridRow, m: 'A' | 'B' | 'C' | 'D') =>
  r.answered ? `${r.modes[m]} (${formatPercent(r.modes[m] / r.answered, 0)})` : '—'

/** Grid answers from the waiting list by state: hours, blackout, uncertain, grid mode choices. */
export default async function GridInsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireStaffWithMfa()
  if (!(GRID_INSIGHT_ROLES as readonly string[]).includes(session.role ?? '')) redirect('/admin')
  const sp = await searchParams
  const from = one(sp.from)
  const to = one(sp.to)
  const includeTest = await includeTestData(sp.test)
  const r = await loadGridInsights({ from, to, includeTest })
  const csv = new URLSearchParams()
  if (from) csv.set('from', from)
  if (to) csv.set('to', to)
  if (includeTest) csv.set('test', '1')
  const rows = [...r.states, r.total]

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Grid insights</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        What customers told us about their grid supply, by state. Hours are averages over the
        customers who gave hours (grid every day or on some days). Blackout includes &ldquo;D · no
        grid&rdquo;. Test data is left out.
      </p>

      <form className="mt-6 flex flex-wrap items-end gap-3" data-testid="grid-filters">
        <div className="space-y-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={from} className="h-10" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={to} className="h-10" />
        </div>
        {includeTest && <input type="hidden" name="test" value="1" />}
        <Button type="submit" className="h-10">
          Show
        </Button>
        <a
          href={`/api/admin/grid-insights.csv${csv.size ? `?${csv}` : ''}`}
          className="text-brand-blue inline-flex h-10 items-center text-sm font-semibold underline"
          data-testid="grid-csv"
        >
          Download CSV
        </a>
        <TestDataToggle path="/admin/grid-insights" params={sp} on={includeTest} />
      </form>

      {r.total.answered === 0 ? (
        <p className="bg-brand-mist mt-6 rounded-xl p-6 text-sm" data-testid="grid-empty">
          No grid answers for these dates yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm" data-testid="grid-table">
            <thead className="bg-brand-green text-left text-white">
              <tr>
                {[
                  'State',
                  'Answered',
                  'Avg day grid',
                  'Avg night grid',
                  'Total blackout',
                  'Uncertain',
                  'A · charge + bypass',
                  'B · charge only',
                  'C · supply only',
                  'D · no grid',
                ].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.state}
                  className={`border-t ${s === r.total ? 'bg-brand-mist font-semibold' : ''}`}
                  data-testid={s === r.total ? 'grid-total' : 'grid-row'}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{s.state}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {s.answered}
                    <span className="text-muted-foreground block text-xs">
                      {s.withHours} gave hours
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{hrs(s.avgDayHours)}</td>
                  <td className="px-3 py-2 tabular-nums">{hrs(s.avgNightHours)}</td>
                  <td className="px-3 py-2 tabular-nums">{share(s.blackoutShare)}</td>
                  <td className="px-3 py-2 tabular-nums">{share(s.uncertainShare)}</td>
                  {(['A', 'B', 'C', 'D'] as const).map((m) => (
                    <td key={m} className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {modeShare(s, m)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
