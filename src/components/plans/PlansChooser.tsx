'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { PlanCard, adviceFor } from '@/components/waitlist/steps'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { CurrentEnergy } from '@/lib/energy/currentSpend'
import { formatNaira } from '@/lib/money'
import type { TenureMonths } from '@/lib/pricing/types'
import { PLANS, PLAN_LABELS, type Estimate } from '@/lib/quotes/buildEstimate'
import { priceVariant } from '@/lib/quotes/quote'
import type { Plan } from '@/lib/sizing/types'
import { whatsappHref } from '@/lib/whatsapp'

import { chooseQuote, payInFull, saveForLater } from '@/app/(public)/plans/actions'

/** Exact notice from the PRD (Feature 4). */
export const BACKUP_NOTICE =
  'Backup hours assume every item on your list is switched on at the same time. In real life this rarely happens, so you will usually get more backup time than shown.'

export function PlansChooser({
  leadId,
  firstName,
  estimate,
  current,
  validUntilLabel,
  reference,
  whatsappNumber,
  fallbackNumber,
  tenures,
}: {
  leadId: string
  firstName: string
  estimate: Estimate
  current: CurrentEnergy | null
  validUntilLabel: string
  reference: string
  whatsappNumber: string
  fallbackNumber: string
  /** Payment-plan lengths this customer may choose (switched-off ones are never shown). */
  tenures: readonly TenureMonths[]
}) {
  const router = useRouter()
  const minPct = Math.round(estimate.plans.comfort.quote.snapshot.minDepositShare * 100)
  const [pct, setPct] = useState(minPct)
  const [tenure, setTenure] = useState<TenureMonths>(
    tenures.includes(12) ? 12 : (tenures[tenures.length - 1] ?? 12),
  )
  const [cashPlan, setCashPlan] = useState<Plan>('comfort')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const variants = useMemo(
    () =>
      Object.fromEntries(
        PLANS.map((p) => [p, priceVariant(estimate, p, tenure, pct / 100)]),
      ) as Record<Plan, ReturnType<typeof priceVariant>>,
    [estimate, tenure, pct],
  )

  function choose(plan: Plan) {
    setNotice(null)
    start(async () => {
      const r = await chooseQuote({ leadId, plan, tenure, depositShare: pct / 100 })
      if (r.ok) router.push(`/account?quote=${r.quoteId}`)
      else setNotice({ ok: false, text: r.error })
    })
  }

  function later() {
    setNotice(null)
    start(async () => {
      const r = await saveForLater({ leadId, tenure, depositShare: pct / 100 })
      setNotice(
        r.ok
          ? {
              ok: true,
              text: `Saved. We've sent your three plans (${r.references.join(', ')}) to your WhatsApp and email, and we'll remind you in two days.`,
            }
          : { ok: false, text: r.error },
      )
    })
  }

  function cash() {
    setNotice(null)
    start(async () => {
      const r = await payInFull({ leadId, plan: cashPlan })
      setNotice(
        r.ok
          ? {
              ok: true,
              text: `Thank you. We'll connect you to a verified vendor near you (${r.reference}, about ${formatNaira(r.cashPrice)} paid in full).`,
            }
          : { ok: false, text: r.error },
      )
    })
  }

  const advisorText = `Hello Go4Solar, I'd like advice on my solar plans (ref ${reference}): ${tenure} months, ${pct}% upfront.`

  return (
    <div className="space-y-6">
      <div className="bg-brand-mist space-y-4 rounded-2xl p-5">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">How much can you pay upfront?</span>
            <span
              className="text-brand-dark text-2xl font-bold tabular-nums"
              data-testid="plans-pct"
            >
              {pct}%
            </span>
          </div>
          <Slider
            className="mt-3"
            min={minPct}
            max={95}
            step={1}
            value={[pct]}
            onValueChange={(v) => setPct(v[0] ?? minPct)}
            aria-label="Upfront contribution percentage"
          />
        </div>
        <div>
          <p className="text-sm font-medium">Spread the rest over</p>
          <div
            className={`mt-2 grid gap-2 ${tenures.length > 4 ? 'grid-cols-3' : 'grid-cols-4'}`}
            role="group"
            aria-label="Tenure"
          >
            {tenures.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTenure(t)}
                aria-pressed={tenure === t}
                className={`min-h-11 rounded-lg border-2 text-sm font-semibold ${
                  tenure === t
                    ? 'border-brand-green bg-brand-green text-white'
                    : 'border-white bg-white'
                }`}
              >
                {t} months
              </button>
            ))}
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Valid until {validUntilLabel}. Prices move with the exchange rate.
        </p>
      </div>

      <div className="space-y-6">
        {PLANS.map((p) => {
          const v = variants[p]
          const realistic = v.size.realisticBackupHours
          return (
            <div key={p} className="space-y-2" data-testid={`plan-${p}`}>
              <PlanCard
                estimate={v}
                advice={adviceFor(v, current, estimate.pricingRateByTenure, tenures)}
              />
              <div className="space-y-1 px-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Panels:</span> {v.size.panelCount} (
                  {v.size.panelKw} kW) ·{' '}
                  <span className="text-muted-foreground">Total amount payable:</span>{' '}
                  <strong data-testid={`total-${p}`}>{formatNaira(v.quote.systemPrice)}</strong>
                </p>
                <p data-testid={`realistic-${p}`}>
                  Your realistic backup:{' '}
                  {realistic === null ? '—' : `about ${Math.round(realistic)} hours`}
                </p>
                {v.savingVsMin > 0 && (
                  <p className="text-brand-green font-semibold">
                    You save {formatNaira(v.savingVsMin)} by paying {pct}%.
                  </p>
                )}
              </div>
              <Button
                type="button"
                className="h-12 w-full text-base"
                onClick={() => choose(p)}
                disabled={pending}
              >
                Choose {PLAN_LABELS[p]}
              </Button>
            </div>
          )
        })}
      </div>

      <p className="text-muted-foreground text-xs">{BACKUP_NOTICE}</p>
      <p className="text-muted-foreground text-xs">
        0% interest: one fixed price, the total amount payable above. Late payments attract 0.75% of
        the overdue amount per day.
      </p>

      {notice && (
        <Alert variant={notice.ok ? 'default' : 'destructive'} role="status">
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild variant="outline" className="h-12">
          <a
            href={whatsappHref(whatsappNumber, advisorText, fallbackNumber)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chat with our solar advisor on WhatsApp
          </a>
        </Button>
        <Button type="button" variant="outline" className="h-12" onClick={later} disabled={pending}>
          Save and decide later
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-4 text-sm">
        <span>Paying the full price upfront?</span>
        <select
          value={cashPlan}
          onChange={(e) => setCashPlan(e.target.value as Plan)}
          className="border-input h-10 rounded-md border bg-white px-2"
          aria-label="Plan to buy outright"
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {PLAN_LABELS[p]}
            </option>
          ))}
        </select>
        <Button type="button" variant="ghost" onClick={cash} disabled={pending}>
          I&apos;ll pay in full
        </Button>
      </div>
      <p className="sr-only">Plans prepared for {firstName}.</p>
    </div>
  )
}
