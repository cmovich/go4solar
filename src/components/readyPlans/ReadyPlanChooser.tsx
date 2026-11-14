'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { formatNaira, formatPercent } from '@/lib/money'
import { stateLabel, type NgStateId } from '@/lib/nigeria/states'
import type { ReadyPlanOffer } from '@/lib/readyPlans/server'

/** The plan page's price box: length, state (extra delivery), figures and the two buttons. */
export function ReadyPlanChooser({
  offer,
  states,
}: {
  offer: ReadyPlanOffer
  states: NgStateId[]
}) {
  const p = offer.plan
  const included = (states.find((s) => s === p.deliveryState) ?? states[0]) as NgStateId
  const [months, setMonths] = useState(
    p.tenures.includes(12) ? 12 : (p.tenures[p.tenures.length - 1] ?? 12),
  )
  const [state, setState] = useState<NgStateId>(included)
  // "Pay in full": one payment of the pay-in-full price instead of a deposit and monthly payments.
  const [full, setFull] = useState(false)
  const extra = offer.extras[state]
  const add = typeof extra === 'number' ? extra : 0
  const row = offer.tenures?.find((t) => t.months === months) ?? null
  const q = new URLSearchParams(
    full ? { months: '12', state, pay: 'full' } : { months: String(months), state },
  )

  return (
    <section className="bg-brand-mist space-y-4 rounded-2xl p-4" data-testid="plan-chooser">
      <div>
        <Label htmlFor="plan-state">Where will it be installed?</Label>
        <select
          id="plan-state"
          value={state}
          onChange={(e) => setState(e.target.value as NgStateId)}
          className="border-input mt-1 block h-12 w-full rounded-md border bg-white px-3 text-base"
        >
          {states.map((s) => (
            <option key={s} value={s}>
              {stateLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Months">
        {p.tenures.map((t) => (
          <Button
            key={t}
            type="button"
            variant={!full && months === t ? 'default' : 'outline'}
            className="h-11"
            aria-pressed={!full && months === t}
            onClick={() => {
              setFull(false)
              setMonths(t)
            }}
          >
            {t} months
          </Button>
        ))}
        <Button
          type="button"
          variant={full ? 'default' : 'outline'}
          className="h-11"
          aria-pressed={full}
          data-testid="choose-full"
          onClick={() => setFull(true)}
        >
          Pay in full
        </Button>
      </div>

      {full && offer.fullPayment !== null ? (
        <div className="space-y-1 tabular-nums" data-testid="plan-figures-full">
          {state !== p.deliveryState && typeof extra === 'number' && extra > 0 && (
            <p className="flex justify-between gap-3">
              <span>Includes delivery to {stateLabel(state)} (extra)</span>
              <strong>{formatNaira(extra)}</strong>
            </p>
          )}
          <p className="flex justify-between gap-3">
            <span>Pay in full, one payment</span>
            <strong data-testid="plan-full-total">{formatNaira(offer.fullPayment + add)}</strong>
          </p>
          <p className="text-sm">
            {formatPercent(p.fullDiscount, 0)} off the 12-month price. No monthly payments, no ID
            checks or guarantor needed.
          </p>
          <p className="text-muted-foreground pt-1 text-sm">One fixed price. No hidden charges.</p>
        </div>
      ) : row && offer.fullPayment !== null ? (
        <div className="space-y-1 tabular-nums" data-testid="plan-figures">
          <p className="flex justify-between gap-3">
            <span>Deposit</span>
            <strong data-testid="plan-deposit">{formatNaira(row.deposit)}</strong>
          </p>
          {state !== p.deliveryState && (
            <p className="flex justify-between gap-3" data-testid="plan-extra-delivery">
              <span>Delivery to {stateLabel(state)} (extra, paid with the deposit)</span>
              <strong>
                {typeof extra === 'number' ? formatNaira(extra) : 'Confirmed when we contact you'}
              </strong>
            </p>
          )}
          <p className="flex justify-between gap-3">
            <span>Then</span>
            <strong data-testid="plan-monthly">
              {formatNaira(row.monthly)} × {months} months
            </strong>
          </p>
          <p className="flex justify-between gap-3">
            <span>Total amount payable</span>
            <strong data-testid="plan-total">{formatNaira(row.totalPayable + add)}</strong>
          </p>
          <p className="flex justify-between gap-3 border-t pt-2">
            <span>Pay in full</span>
            <strong data-testid="plan-full">
              {formatNaira(offer.fullPayment + add)} ({formatPercent(p.fullDiscount, 0)} off)
            </strong>
          </p>
          <p className="text-muted-foreground pt-1 text-sm">One fixed price. No hidden charges.</p>
        </div>
      ) : (
        <p className="text-sm" data-testid="plan-price-later">
          Your exact price will be confirmed when we contact you.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild className="h-12 text-base sm:px-8">
          <Link href={`/plans/${p.slug}/start?${q}`} data-testid="choose-plan">
            Choose this plan
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12 text-base">
          <Link href={`/build?ready=${p.slug}&state=${state}`} data-testid="customise-plan">
            Customise this plan
          </Link>
        </Button>
      </div>
    </section>
  )
}
