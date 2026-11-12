'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Builder } from '@/components/build/Builder'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LaunchMode } from '@/config/site'
import type { LibraryItem } from '@/lib/calculator/store'
import type { BuilderItem } from '@/lib/catalogue/server'
import { NG_STATE_IDS, stateLabel, type NgStateId } from '@/lib/nigeria/states'
import type { WiringSettings } from '@/lib/wizard/questions'
import type { RoofTypeCard } from '@/lib/wizard/server'

import { createQuotation, createQuotationFromPlan } from '@/app/admin/(shell)/quotations/actions'

/**
 * Admin → New quotation: optional customer name and phone, the state (prices, delivery and sun
 * hours), then the system builder exactly as customers use it, ending with "Create quotation".
 */
export function StaffQuotationForm({
  items,
  roofTypes,
  wiring,
  library,
  launchMode,
  showPrices,
  plans,
}: {
  items: BuilderItem[]
  roofTypes: RoofTypeCard[]
  wiring: WiringSettings
  library: LibraryItem[]
  launchMode: LaunchMode
  showPrices: boolean
  /** Ready-made plans that are switched on (name and lengths only). */
  plans: { slug: string; name: string; summary: string; tenures: number[] }[]
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState<NgStateId | ''>('')
  const [planSlug, setPlanSlug] = useState('')
  const [planMonths, setPlanMonths] = useState(12)
  const [planError, setPlanError] = useState<string | null>(null)
  const [planPending, startPlan] = useTransition()
  const plan = plans.find((p) => p.slug === planSlug) ?? null
  return (
    <div className="space-y-8">
      {/* A plain group (no floated legend): the title sits above, the fields form their own
          rows: Name and Phone side by side from tablet width, State below; one per line on phones. */}
      <div
        role="group"
        aria-labelledby="q-customer-title"
        className="bg-brand-mist space-y-3 rounded-2xl p-4"
        data-testid="quote-customer"
      >
        <p id="q-customer-title" className="text-brand-dark font-semibold">
          Customer (optional)
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="q-name">Name</Label>
            <Input
              id="q-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 bg-white"
            />
          </div>
          <div>
            <Label htmlFor="q-phone">Phone</Label>
            <Input
              id="q-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 h-11 bg-white"
              placeholder="0803 123 4567"
            />
          </div>
          <div>
            <Label htmlFor="q-state">State</Label>
            <select
              id="q-state"
              value={state}
              onChange={(e) => setState(e.target.value as NgStateId | '')}
              className="border-input mt-1 block h-11 w-full rounded-md border bg-white px-3 text-base"
            >
              <option value="">Choose the state</option>
              {NG_STATE_IDS.map((id) => (
                <option key={id} value={id}>
                  {stateLabel(id)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          The state sets the installation and delivery prices and the sun hours. Name and phone are
          only printed on the quotation and used for the WhatsApp message.
        </p>
      </div>

      {plans.length > 0 && (
        <section className="space-y-3 rounded-2xl border p-4" data-testid="start-from-plan">
          <p className="text-brand-dark font-semibold">Start from a ready-made plan</p>
          <p className="text-muted-foreground text-xs">
            The plan&rsquo;s fixed price for the state above (delivery outside the plan&rsquo;s
            state is added). Or build a system below.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="q-plan">Plan</Label>
              <select
                id="q-plan"
                value={planSlug}
                onChange={(e) => {
                  setPlanSlug(e.target.value)
                  const next = plans.find((p) => p.slug === e.target.value)
                  if (next && !next.tenures.includes(planMonths)) {
                    setPlanMonths(next.tenures.includes(12) ? 12 : next.tenures[0]!)
                  }
                }}
                className="border-input mt-1 block h-11 w-full rounded-md border bg-white px-3 text-base"
              >
                <option value="">Choose a plan</option>
                {plans.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} — {p.summary}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="q-plan-months">Months</Label>
              <select
                id="q-plan-months"
                value={planMonths}
                disabled={!plan}
                onChange={(e) => setPlanMonths(Number(e.target.value))}
                className="border-input mt-1 block h-11 w-full rounded-md border bg-white px-3 text-base"
              >
                {(plan?.tenures ?? [12]).map((t) => (
                  <option key={t} value={t}>
                    {t} months
                  </option>
                ))}
              </select>
            </div>
          </div>
          {planError && (
            <p className="text-destructive text-sm" role="alert">
              {planError}
            </p>
          )}
          <Button
            type="button"
            className="h-11"
            disabled={!plan || planPending}
            data-testid="create-from-plan"
            onClick={() =>
              startPlan(async () => {
                setPlanError(null)
                const r = await createQuotationFromPlan({
                  customer: { name, phone, state },
                  ready: { slug: planSlug, months: planMonths },
                })
                if (!r.ok) return setPlanError(r.error)
                router.push(`/admin/quotations/${r.id}`)
              })
            }
          >
            {planPending ? 'Creating…' : 'Create quotation from this plan'}
          </Button>
        </section>
      )}

      <Builder
        items={items}
        roofTypes={roofTypes}
        wiring={wiring}
        launchMode={launchMode}
        showPrices={showPrices}
        initial={null}
        done={false}
        staff={{
          state: state || null,
          library,
          onCreate: async ({ selection, depositShare, tenure }) => {
            const r = await createQuotation({
              customer: { name, phone, state },
              selection,
              depositShare,
              tenure,
            })
            if (!r.ok) return r.error
            router.push(`/admin/quotations/${r.id}`)
            return null
          },
        }}
      />
    </div>
  )
}
