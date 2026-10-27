'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'

import { plansLinkFromCalculator } from '@/lib/waitlist/entry'

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
  needsEssential = false,
  onSuggestEssential,
}: {
  totals: LoadTotals
  hasItems: boolean
  launchMode: LaunchMode
  /** When given, a Continue button replaces the link (waiting-list flow). */
  onContinue?: () => void
  /** No item is ticked Essential yet: the Essentials plan needs at least one. */
  needsEssential?: boolean
  /** Tick the suggested items (lights, fans, TVs, phone charging). */
  onSuggestEssential?: () => void
}) {
  const ready = hasItems && !needsEssential
  // Both modes: the details flow reads the saved appliances and skips the calculator.
  const nextHref = plansLinkFromCalculator(launchMode)

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
        {hasItems && needsEssential && (
          <div
            className="border-brand-orange bg-brand-orange/10 text-brand-dark mb-4 rounded-xl border-2 p-4 text-sm"
            role="alert"
            data-testid="essential-needed"
          >
            <p className="font-semibold">Tick at least one item as Essential.</p>
            <p className="mt-1">
              The Essentials plan keeps only those items on when the power goes. Most homes tick
              lights, fans, TV and phone charging.
            </p>
            {onSuggestEssential && (
              <button
                type="button"
                onClick={onSuggestEssential}
                className="text-brand-blue mt-2 min-h-11 font-semibold underline"
              >
                Tick lights, fans, TV and phone charging
              </button>
            )}
          </div>
        )}
        {ready && onContinue ? (
          <button
            type="button"
            onClick={onContinue}
            className="bg-brand-orange hover:bg-brand-orange/90 focus-visible:ring-brand-green text-brand-dark inline-flex h-14 w-full items-center justify-center rounded-lg px-8 text-lg font-semibold shadow-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
          >
            Continue
          </button>
        ) : ready ? (
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
