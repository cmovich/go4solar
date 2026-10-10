'use client'

import type { LoadTotals } from '@/lib/load/types'

const n = (v: number) => v.toLocaleString('en-US')

/** Sticks to the bottom of the screen so the numbers are always in view while adding items. */
export function TotalsBar({ totals }: { totals: LoadTotals }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <dl className="mx-auto grid max-w-3xl grid-cols-3 divide-x px-2 py-3 sm:px-6">
        <div className="px-2 text-center">
          <dt className="text-muted-foreground text-xs">Running</dt>
          <dd
            className="text-brand-dark text-lg font-bold tabular-nums"
            data-testid="total-running"
          >
            {n(totals.runningW)} W
          </dd>
        </div>
        <div className="px-2 text-center">
          <dt className="text-muted-foreground text-xs">Starting (surge)</dt>
          <dd className="text-brand-dark text-lg font-bold tabular-nums" data-testid="total-surge">
            {n(totals.surgeW)} W
          </dd>
        </div>
        <div className="px-2 text-center">
          <dt className="text-muted-foreground text-xs">Energy per day</dt>
          <dd className="text-brand-dark text-lg font-bold tabular-nums" data-testid="total-kwh">
            {totals.dailyKwh.toFixed(2)} kWh
          </dd>
        </div>
      </dl>
    </div>
  )
}
