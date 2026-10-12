'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'

import type { LaunchMode } from '@/config/site'
import type { LoadTotals } from '@/lib/load/types'

// Recharts is heavy: load it only on the client, after the page is usable.
const CategoryChart = dynamic(() => import('./CategoryChart').then((m) => m.CategoryChart), {
  ssr: false,
  loading: () => <div className="bg-brand-mist h-56 animate-pulse rounded-xl" aria-hidden />,
})

const n = (v: number) => v.toLocaleString('en-US')

export function Results({
  totals,
  hasItems,
  launchMode,
  onContinue,
}: {
  totals: LoadTotals
  hasItems: boolean
  launchMode: LaunchMode
  /** When given, a Continue button replaces the link (waiting-list flow). */
  onContinue?: () => void
}) {
  // Prelaunch: the waiting list reads the same saved items. Live: straight to the plans.
  const nextHref = launchMode === 'prelaunch' ? '/waitlist' : '/get-started'

  return (
    <section className="mt-10" aria-labelledby="results-heading">
      <h2 id="results-heading" className="text-brand-dark text-lg font-semibold">
        3. Your results
      </h2>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="bg-brand-mist rounded-xl p-5">
          <dt className="text-muted-foreground text-sm">Running watts</dt>
          <dd className="text-brand-dark text-3xl font-bold tabular-nums">
            {n(totals.runningW)} W
          </dd>
          <p className="text-muted-foreground mt-1 text-xs">Everything on at once</p>
        </div>
        <div className="bg-brand-mist rounded-xl p-5">
          <dt className="text-muted-foreground text-sm">Starting (surge) watts</dt>
          <dd className="text-brand-dark text-3xl font-bold tabular-nums">{n(totals.surgeW)} W</dd>
          <p className="text-muted-foreground mt-1 text-xs">Motors draw more for a second</p>
        </div>
        <div className="bg-brand-mist rounded-xl p-5">
          <dt className="text-muted-foreground text-sm">Daily energy</dt>
          <dd className="text-brand-dark text-3xl font-bold tabular-nums">
            {totals.dailyKwh.toFixed(2)} kWh
          </dd>
          <p className="text-muted-foreground mt-1 text-xs">From the hours you entered</p>
        </div>
      </dl>

      {hasItems && (
        <div className="mt-6">
          <h3 className="text-brand-dark text-base font-semibold">What is driving the size</h3>
          <p className="text-muted-foreground mb-3 text-sm">Running watts by category.</p>
          <CategoryChart byCategoryW={totals.byCategoryW} />
        </div>
      )}

      <div className="mt-8">
        {hasItems && onContinue ? (
          <button
            type="button"
            onClick={onContinue}
            className="bg-brand-orange hover:bg-brand-orange/90 focus-visible:ring-brand-green text-brand-dark inline-flex h-14 w-full items-center justify-center rounded-lg px-8 text-lg font-semibold shadow-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
          >
            Continue
          </button>
        ) : hasItems ? (
          <Link
            href={nextHref}
            prefetch={false}
            className="bg-brand-orange hover:bg-brand-orange/90 focus-visible:ring-brand-green text-brand-dark inline-flex h-14 w-full items-center justify-center rounded-lg px-8 text-lg font-semibold shadow-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
          >
            See my solar plans
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="bg-brand-orange/50 text-brand-dark inline-flex h-14 w-full cursor-not-allowed items-center justify-center rounded-lg px-8 text-lg font-semibold sm:w-auto"
          >
            See my solar plans
          </button>
        )}
        <p className="text-muted-foreground mt-2 text-xs">
          Your list is saved on this device, so you can come back and continue later.
        </p>
      </div>
    </section>
  )
}
