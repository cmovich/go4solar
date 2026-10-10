'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Calculator } from '@/components/calculator/Calculator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StateSelect } from '@/components/waitlist/steps'
import type { LibraryItem } from '@/lib/calculator/store'
import { GENERATOR_LABELS, GENERATOR_TYPES } from '@/lib/energy/currentSpend'
import type { LoadItem } from '@/lib/load/types'
import type { NgStateId } from '@/lib/nigeria/states'
import { PLANS, PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import {
  APPLICANT_TYPES,
  APPLICANT_TYPE_LABELS,
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  CONSENT_TEXT,
  ENTRY_CHANNELS,
  ENTRY_CHANNEL_LABELS,
  READY_WHEN,
  READY_WHEN_LABELS,
  type ApplicantType,
} from '@/lib/waitlist/schema'

import { assistedEntry } from '@/app/admin/waitlist/actions'

const field = 'mt-1 h-11 text-base'
const select = 'border-input mt-1 h-11 w-full rounded-md border bg-white px-3 text-base'

/** Same steps as the customer flow, on one staff screen. */
export function AssistedEntryForm({ library }: { library: LibraryItem[] }) {
  const router = useRouter()
  const [items, setItems] = useState<LoadItem[] | null>(null)
  const [consent, setConsent] = useState(false)
  const [state, setState] = useState<NgStateId>('FCT')
  const [applicantType, setApplicantType] = useState<ApplicantType>('individual')
  const [pct, setPct] = useState(20)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const label = useMemo(
    () => (items ? `${items.length} appliance${items.length === 1 ? '' : 's'} captured` : null),
    [items],
  )

  if (!items) {
    return (
      <section>
        <h2 className="text-brand-dark text-lg font-semibold">
          Step 1 · The customer&apos;s appliances
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Build the list with the customer, then press Continue.
        </p>
        <Calculator library={library} launchMode="prelaunch" onContinue={setItems} />
      </section>
    )
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const f = new FormData(e.currentTarget)
    const str = (k: string) => String(f.get(k) ?? '').trim()
    const num = (k: string) => (str(k) === '' ? Number.NaN : Number(str(k)))
    const business =
      applicantType === 'business'
        ? {
            businessName: str('businessName'),
            businessType: str('businessType'),
            cacNumber: str('cacNumber'),
            contactRole: str('contactRole'),
            staffCount: num('staffCount'),
            hoursPerDay: num('hoursPerDay'),
            daysPerWeek: num('daysPerWeek'),
          }
        : undefined
    const input = {
      items,
      phone: str('phone'),
      whatsapp: str('whatsapp') || undefined,
      email: str('email'),
      firstName: str('firstName'),
      surname: str('surname'),
      state,
      lga: str('lga'),
      consent,
      applicantType,
      business,
      plan: str('plan'),
      depositShare: pct / 100,
      readyWhen: str('readyWhen'),
      entryChannel: str('entryChannel'),
      energy: {
        generator: str('generator'),
        weeklyFuelNaira: str('weeklyFuelNaira') === '' ? null : num('weeklyFuelNaira'),
        weeklyGridNaira: str('weeklyGridNaira') === '' ? null : num('weeklyGridNaira'),
      },
    }
    start(async () => {
      const r = await assistedEntry(input)
      if (r.ok) router.push('/admin/waitlist?tab=complete')
      else setError(r.error)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="bg-brand-mist flex items-center justify-between rounded-lg px-4 py-3 text-sm">
        <span className="text-brand-dark font-medium">{label}</span>
        <button type="button" onClick={() => setItems(null)} className="text-brand-blue underline">
          Edit appliances
        </button>
      </div>

      <section>
        <h2 className="text-brand-dark text-lg font-semibold">Step 2 · Contact details</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" inputMode="tel" required className={field} />
          </div>
          <div>
            <Label htmlFor="whatsapp">WhatsApp (if different)</Label>
            <Input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" className={field} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input id="email" name="email" type="email" inputMode="email" className={field} />
          </div>
          <div>
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" name="firstName" required className={field} />
          </div>
          <div>
            <Label htmlFor="surname">Surname</Label>
            <Input id="surname" name="surname" required className={field} />
          </div>
          <div>
            <Label htmlFor="state">State</Label>
            <StateSelect id="state" value={state} onChange={setState} />
          </div>
          <div>
            <Label htmlFor="lga">LGA</Label>
            <Input id="lga" name="lga" required className={field} />
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            className="mt-0.5"
          />
          <span>Customer agreed: &ldquo;{CONSENT_TEXT}&rdquo;</span>
        </label>
      </section>

      <section>
        <h2 className="text-brand-dark text-lg font-semibold">Step 3 · Who is the solar for?</h2>
        <div className="mt-3 flex gap-2">
          {APPLICANT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setApplicantType(t)}
              aria-pressed={applicantType === t}
              className={`min-h-11 rounded-lg border-2 px-4 text-sm font-semibold ${
                applicantType === t
                  ? 'border-brand-green bg-brand-green text-white'
                  : 'border-brand-mist text-brand-dark bg-white'
              }`}
            >
              {t === 'individual' ? 'Home (individual)' : APPLICANT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {applicantType === 'business' && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="businessName">Business name</Label>
              <Input id="businessName" name="businessName" className={field} />
            </div>
            <div>
              <Label htmlFor="businessType">Type of business</Label>
              <select id="businessType" name="businessType" className={select} defaultValue="shop">
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {BUSINESS_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cacNumber">CAC number (optional)</Label>
              <Input id="cacNumber" name="cacNumber" className={field} />
            </div>
            <div>
              <Label htmlFor="contactRole">Contact person&apos;s role</Label>
              <Input id="contactRole" name="contactRole" className={field} />
            </div>
            <div>
              <Label htmlFor="staffCount">Number of staff</Label>
              <Input
                id="staffCount"
                name="staffCount"
                type="number"
                inputMode="numeric"
                min={0}
                className={field}
              />
            </div>
            <div>
              <Label htmlFor="hoursPerDay">Operating hours per day</Label>
              <Input
                id="hoursPerDay"
                name="hoursPerDay"
                type="number"
                inputMode="decimal"
                min={0}
                max={24}
                step={0.5}
                className={field}
              />
            </div>
            <div>
              <Label htmlFor="daysPerWeek">Days per week</Label>
              <Input
                id="daysPerWeek"
                name="daysPerWeek"
                type="number"
                inputMode="numeric"
                min={1}
                max={7}
                className={field}
              />
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-brand-dark text-lg font-semibold">Step 4 · Power today</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="generator">Generator</Label>
            <select id="generator" name="generator" className={select} defaultValue="none">
              {GENERATOR_TYPES.map((g) => (
                <option key={g} value={g}>
                  {GENERATOR_LABELS[g]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="weeklyFuelNaira">Fuel per week (₦, blank = unknown)</Label>
            <Input
              id="weeklyFuelNaira"
              name="weeklyFuelNaira"
              type="number"
              inputMode="numeric"
              min={0}
              className={field}
            />
          </div>
          <div>
            <Label htmlFor="weeklyGridNaira">Grid bills per week (₦, blank = unknown)</Label>
            <Input
              id="weeklyGridNaira"
              name="weeklyGridNaira"
              type="number"
              inputMode="numeric"
              min={0}
              className={field}
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-brand-dark text-lg font-semibold">Step 5 · Plan and contribution</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="plan">Plan</Label>
            <select id="plan" name="plan" className={select} defaultValue="comfort">
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {PLAN_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="pct">Upfront contribution (%)</Label>
            <Input
              id="pct"
              type="number"
              inputMode="numeric"
              min={20}
              max={95}
              value={pct}
              onChange={(e) => setPct(Math.min(95, Math.max(20, Number(e.target.value) || 20)))}
              className={field}
            />
          </div>
          <div>
            <Label htmlFor="readyWhen">When can they pay?</Label>
            <select id="readyWhen" name="readyWhen" className={select} defaultValue="now">
              {READY_WHEN.map((r) => (
                <option key={r} value={r}>
                  {READY_WHEN_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-brand-dark text-lg font-semibold">Step 6 · How did this come in?</h2>
        <select
          name="entryChannel"
          className={`${select} sm:max-w-xs`}
          defaultValue="phone_call"
          aria-label="Entry channel"
        >
          {ENTRY_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {ENTRY_CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
      </section>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="h-12 text-base" disabled={pending}>
        {pending ? 'Saving…' : 'Save customer'}
      </Button>
    </form>
  )
}
