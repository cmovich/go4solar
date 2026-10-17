import type { Metadata } from 'next'
import Link from 'next/link'

import { ProfitCharts, type ProfitChartData } from '@/components/admin/profit/ProfitCharts'
import { TestDataToggle } from '@/components/admin/TestDataToggle'
import { includeTestData } from '@/lib/testmode/server'
import { requireRole } from '@/lib/auth/roles'
import { runForecast } from '@/lib/forecast/run'
import { scenarioFromInputs } from '@/lib/forecast/scenario'
import { LockBadge } from '@/components/admin/LockBadge'
import { formatNaira } from '@/lib/money'
import { defaultInputs } from '@/lib/reports/forecast'
import { profitDashboard } from '@/lib/reports/profit'
import { TENURES } from '@/lib/pricing/types'

export const metadata: Metadata = { title: 'Profit' }
export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined
const select = 'border-input h-10 rounded-md border bg-white px-2 text-sm'

const STATUS: Record<string, string> = {
  not_started: 'Not installed yet',
  on_time: 'On time',
  late: 'Late',
  paid_off: 'Paid off',
  defaulted: 'Defaulted',
}

/** Next calendar month keys after `from` (YYYY-MM). */
function monthsAfter(from: string, n: number): string[] {
  const [y, m] = from.split('-').map(Number) as [number, number]
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(y, m + k, 1))
    return d.toISOString().slice(0, 7)
  })
}

/** Profit dashboard (super admin, finance). Test customers are left out unless shown. */
export default async function ProfitPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole('super_admin', 'finance')
  const sp = await searchParams
  const filters = {
    funder: one(sp.funder),
    state: one(sp.state),
    tenure: one(sp.tenure),
    band: one(sp.band),
    type: one(sp.type),
    installer: one(sp.installer),
    includeTest: await includeTestData(sp.test),
  }
  const [d, inputs] = await Promise.all([profitDashboard(filters), defaultInputs()])
  const { totals } = d.portfolio

  // Chart data: actual collected profit by month, then the base forecast (cash basis) from next month.
  const thisMonth = new Date(Date.now() + 3_600_000).toISOString().slice(0, 7)
  const projection = runForecast(scenarioFromInputs({ ...inputs, years: 1, mode: 'cash' }, 'base'))
  const future = monthsAfter(thisMonth, 12)
  let cumulative = 0
  const actualRows = d.portfolio.months
    .filter((m) => m.month <= thisMonth)
    .map((m) => {
      cumulative += m.profitCollected
      return { month: m.month, actual: m.profitCollected, projected: null, cumulative }
    })
  const projectedRows = future.map((month, k) => {
    const value = Math.round(projection.months[k]!.contribution)
    cumulative += value
    return { month, actual: null, projected: value, cumulative }
  })
  const base10 = runForecast(scenarioFromInputs(inputs, 'base'))
  const chart: ProfitChartData = {
    timeline: [...actualRows, ...projectedRows],
    forecastStarts: future[0]!,
    byTenure: d.portfolio.byTenure,
    byBand: d.portfolio.byDepositBand,
    cash: d.portfolio.months.map((m) => ({
      month: m.month,
      cashIn: m.cashIn,
      funderOut: m.funderOut,
    })),
    capital: base10.years.map((y) => ({
      year: `Y${y.year}`,
      capitalNeeded: Math.round(y.capitalNeeded),
    })),
    funderBalance: d.funderBalances.reduce((s, f) => s + f.balance, 0),
    risk: d.portfolio.risk,
  }

  const cards: [string, number, string?][] = [
    ['Profit this month', totals.profitThisMonth],
    ['Profit this year', totals.profitThisYear],
    ['Profit all time', totals.allTime],
    ['GRAND TOTAL profit or loss', totals.grandTotal, 'Collected profit minus overheads to date'],
    ['Booked', totals.booked, 'Net profit on every signed loan'],
    ['Collected', totals.collected, 'Profit already received in cash'],
    ['At risk', totals.atRisk, 'Profit still to come on loans 30+ days late'],
  ]

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-brand-dark text-3xl font-bold">Profit</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            From approved loans and real payments. Projections use today&apos;s settings (see{' '}
            <Link href="/admin/forecasts" className="text-brand-blue underline">
              Forecasts
            </Link>
            ).
          </p>
          <div className="mt-2">
            <TestDataToggle path="/admin/profit" params={sp} on={filters.includeTest} />
          </div>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <select
          name="funder"
          defaultValue={filters.funder ?? ''}
          className={select}
          aria-label="Funder"
        >
          <option value="">All funders</option>
          {d.options.funders.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          name="state"
          defaultValue={filters.state ?? ''}
          className={select}
          aria-label="State"
        >
          <option value="">All states</option>
          {d.options.states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          name="tenure"
          defaultValue={filters.tenure ?? ''}
          className={select}
          aria-label="Tenure"
        >
          <option value="">All tenures</option>
          {TENURES.map((t) => (
            <option key={t} value={t}>
              {t} months
            </option>
          ))}
        </select>
        <select
          name="band"
          defaultValue={filters.band ?? ''}
          className={select}
          aria-label="Deposit band"
        >
          <option value="">All deposits</option>
          {['20–29%', '30–39%', '40–49%', '50%+'].map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={filters.type ?? ''}
          className={select}
          aria-label="Applicant type"
        >
          <option value="">Homes and businesses</option>
          <option value="individual">Homes</option>
          <option value="business">Businesses</option>
        </select>
        <select
          name="installer"
          defaultValue={filters.installer ?? ''}
          className={select}
          aria-label="Installer"
        >
          <option value="">All installers</option>
          {d.options.installers.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
        {filters.includeTest && <input type="hidden" name="test" value="1" />}
        <button
          type="submit"
          className="bg-brand-dark h-10 rounded-md px-4 text-sm font-semibold text-white"
        >
          Filter
        </button>
      </form>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="profit-cards">
        {cards.map(([label, value, hint]) => (
          <li
            key={label}
            className={`rounded-xl p-4 ${label.startsWith('GRAND') ? 'bg-brand-dark text-white' : 'bg-brand-mist'}`}
          >
            <span className="block text-xs font-semibold opacity-80">{label}</span>
            <span className={`text-xl font-bold ${value < 0 ? 'text-red-600' : ''}`}>
              {formatNaira(value)}
            </span>
            {hint && <span className="block text-xs opacity-70">{hint}</span>}
          </li>
        ))}
        <li className="bg-brand-mist rounded-xl p-4">
          <span className="block text-xs font-semibold opacity-80">CO₂ avoided, all time</span>
          <span className="text-xl font-bold">{d.co2Tonnes.toFixed(1)} tonnes</span>
        </li>
      </ul>
      {d.overheadsSample && (
        <p className="text-xs text-amber-800">Overheads include SAMPLE values.</p>
      )}

      <ProfitCharts d={chart} />

      <section>
        <h2 className="text-brand-dark text-lg font-bold">Per customer</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm" data-testid="profit-customers">
            <thead>
              <tr className="bg-brand-green text-left text-white">
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Funder</th>
                <th className="px-2 py-2 text-right">Monthly profit</th>
                <th className="px-2 py-2 text-right">To date</th>
                <th className="px-2 py-2 text-right">Still to come</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2 text-right">Actual vs plan</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id} className="even:bg-brand-mist">
                  <td className="px-2 py-2">
                    {r.customer}
                    <span className="text-muted-foreground block text-xs">
                      {r.tenure} months · {r.state ?? '—'} · {r.installer ?? 'no installer yet'}
                    </span>
                  </td>
                  <td className="px-2 py-2">{r.funderName ?? '—'}</td>
                  <td className="px-2 py-2 text-right">{formatNaira(r.profit.monthlyProfit)}</td>
                  <td className="px-2 py-2 text-right">{formatNaira(r.profit.profitToDate)}</td>
                  <td className="px-2 py-2 text-right">{formatNaira(r.profit.profitToCome)}</td>
                  <td
                    className={`px-2 py-2 ${r.profit.status === 'late' ? 'font-semibold text-red-700' : ''}`}
                  >
                    {STATUS[r.profit.status]}
                    {r.profit.daysOverdue > 0 && ` (${r.profit.daysOverdue} days)`}
                    <LockBadge lock={r.lock} />
                  </td>
                  <td
                    className={`px-2 py-2 text-right ${r.profit.actualVsPlan < 0 ? 'text-red-700' : 'text-brand-green'}`}
                  >
                    {r.profit.actualVsPlan === 0 ? 'On plan' : formatNaira(r.profit.actualVsPlan)}
                  </td>
                </tr>
              ))}
              {d.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted-foreground px-2 py-6 text-center">
                    No approved loans{filters.includeTest ? '' : ' (test data hidden)'}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-brand-dark text-lg font-bold">Funders</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm" data-testid="profit-funders">
            <thead>
              <tr className="bg-brand-green text-left text-white">
                <th className="px-2 py-2">Funder</th>
                <th className="px-2 py-2 text-right">Drawn</th>
                <th className="px-2 py-2 text-right">Repaid</th>
                <th className="px-2 py-2 text-right">Outstanding</th>
                <th className="px-2 py-2 text-right">Interest paid</th>
                <th className="px-2 py-2 text-right">Due next 90 days</th>
                <th className="px-2 py-2">Cash gap next month</th>
              </tr>
            </thead>
            <tbody>
              {d.portfolio.funders.map((f) => (
                <tr key={f.funderId} className="even:bg-brand-mist">
                  <td className="px-2 py-2 font-semibold">{f.funderName}</td>
                  <td className="px-2 py-2 text-right">{formatNaira(f.drawn)}</td>
                  <td className="px-2 py-2 text-right">{formatNaira(f.repaid)}</td>
                  <td className="px-2 py-2 text-right">{formatNaira(f.outstanding)}</td>
                  <td className="px-2 py-2 text-right">{formatNaira(f.interestPaid)}</td>
                  <td className="px-2 py-2 text-right">{formatNaira(f.dueNext90Days)}</td>
                  <td className="px-2 py-2">
                    {f.cashGap ? (
                      <span className="font-semibold text-red-700">
                        Alert: {formatNaira(f.dueNextMonth)} due vs{' '}
                        {formatNaira(f.collectionsNextMonth)} expected in
                      </span>
                    ) : (
                      'Covered'
                    )}
                  </td>
                </tr>
              ))}
              {d.portfolio.funders.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted-foreground px-2 py-6 text-center">
                    No money drawn yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
