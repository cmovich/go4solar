import { formatNaira, formatPercent } from '@/lib/money'
import type { Headline } from '@/lib/waitlist/admin'

/** The funder numbers (PRD "Admin waiting-list view"). */
export function HeadlineCards({ stats }: { stats: Headline }) {
  const cards: { label: string; value: string; hint?: string }[] = [
    {
      label: 'Total sign-ups',
      value: String(stats.total),
      hint: `${stats.complete} complete · ${stats.incomplete} incomplete`,
    },
    {
      label: 'Total system value',
      value: formatNaira(stats.systemValue),
      hint: 'Chosen plans, complete sign-ups',
    },
    { label: 'Deposits pledged', value: formatNaira(stats.depositsPledged) },
    {
      label: 'Financing needed',
      value: formatNaira(stats.financingNeeded),
      hint: 'System value − deposits',
    },
    {
      label: 'Average deposit',
      value: stats.averageDepositShare === null ? '—' : formatPercent(stats.averageDepositShare, 1),
    },
    { label: 'Ready "now"', value: String(stats.readyNow), hint: 'Can pay upfront today' },
  ]
  return (
    <div className="mt-6 space-y-4">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-brand-mist rounded-xl p-4">
            <dt className="text-muted-foreground text-xs">{c.label}</dt>
            <dd className="text-brand-dark mt-1 text-xl font-bold tabular-nums">{c.value}</dd>
            {c.hint && <p className="text-muted-foreground mt-1 text-xs">{c.hint}</p>}
          </div>
        ))}
      </dl>
      {stats.byState.length > 0 && (
        <div className="rounded-xl border p-4">
          <p className="text-brand-dark text-sm font-semibold">Sign-ups by state</p>
          <ul className="mt-2 space-y-1.5">
            {stats.byState.map((s) => {
              const pct = stats.total ? Math.round((s.count / stats.total) * 100) : 0
              return (
                <li key={s.state} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0">{s.state}</span>
                  <span className="bg-brand-mist h-3 flex-1 overflow-hidden rounded-full">
                    <span
                      className="bg-brand-green block h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-16 text-right tabular-nums">
                    {s.count} ({pct}%)
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
