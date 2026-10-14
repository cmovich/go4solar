'use client'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { NairaInput } from './NairaInput'
import type { LaunchMode } from '@/config/site'
import {
  GENERATOR_LABELS,
  GENERATOR_TYPES,
  co2Avoided,
  recommendTenure,
  type CurrentEnergy,
  type GeneratorType,
} from '@/lib/energy/currentSpend'
import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadItem } from '@/lib/load/types'
import { formatNaira, formatPercent } from '@/lib/money'
import { STATE_GROUPS, stateLabel, type NgStateId } from '@/lib/nigeria/states'
import {
  PLANS,
  PLAN_LABELS,
  monthlyByTenure,
  repriceEstimate,
  type Estimate,
  type PlanEstimate,
} from '@/lib/quotes/buildEstimate'
import type { TenureMonths } from '@/lib/pricing/types'
import type { Plan } from '@/lib/sizing/types'
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  CONSENT_TEXT,
  READY_WHEN,
  READY_WHEN_LABELS,
  businessSchema,
  emailStepSchema,
  energyStepSchema,
  nameStepSchema,
  phoneStepSchema,
  type ApplicantType,
} from '@/lib/waitlist/schema'

import {
  completeWaitlist,
  saveApplicantStep,
  saveEmailStep,
  saveEnergyStep,
  saveNameStep,
  savePhoneStep,
  savePlanStep,
} from '@/app/(public)/waitlist/actions'

const n = (v: number) => v.toLocaleString('en-US')
const field = 'mt-1 h-12 text-base'
const select = 'border-input mt-1 h-12 w-full rounded-md border bg-white px-3 text-base'
const primary = 'h-14 w-full text-lg font-semibold'

/** A clear way back on every step (top left, 44 px tall for thumbs). */
export function BackLink({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-brand-blue -ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm font-medium underline"
    >
      <span aria-hidden>‹</span> {label}
    </button>
  )
}

function Heading({
  title,
  lead,
  onBack,
  backLabel,
}: {
  title: string
  lead?: string
  onBack?: () => void
  backLabel?: string
}) {
  return (
    <div>
      {onBack && <BackLink onClick={onBack} label={backLabel} />}
      <h1 className="text-brand-dark text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {lead && <p className="text-muted-foreground mt-2 text-base">{lead}</p>}
    </div>
  )
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

// ---------------------------------------------------------------- 2. Totals
export function TotalsStep({
  items,
  onBack,
  onNext,
}: {
  items: LoadItem[]
  onBack: () => void
  onNext: () => void
}) {
  const t = useMemo(() => computeLoadTotals(items), [items])
  return (
    <div className="space-y-6">
      <Heading
        title="Your total load"
        lead={`${items.length} appliance${items.length === 1 ? '' : 's'} on your list.`}
        onBack={onBack}
        backLabel="Back to my appliances"
      />
      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          ['Running watts', `${n(t.runningW)} W`],
          ['Starting (surge) watts', `${n(t.surgeW)} W`],
          ['Daily energy', `${t.dailyKwh.toFixed(2)} kWh`],
        ].map(([k, v]) => (
          <div key={k} className="bg-brand-mist rounded-xl p-5">
            <dt className="text-muted-foreground text-sm">{k}</dt>
            <dd className="text-brand-dark text-3xl font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <Button type="button" className={primary} onClick={onNext}>
        Get quotes
      </Button>
    </div>
  )
}

// ------------------------------------------------------------- 3. Preparing
export function PreparingStep() {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center"
      role="status"
    >
      <Loader2 className="text-brand-green h-12 w-12 animate-spin" aria-hidden />
      <p className="text-brand-dark text-2xl font-bold">Preparing your quotes…</p>
      <p className="text-muted-foreground text-base">Sizing three systems for your load.</p>
    </div>
  )
}

// ----------------------------------------------------------------- 4. Phone
export type PhoneValues = { phone: string; whatsapp: string; same: boolean }

export function PhoneStep({
  items,
  leadId,
  initial,
  pausing,
  onBack,
  onSaved,
}: {
  items: LoadItem[]
  /** Set when the visitor came back to this screen: their lead is updated, not duplicated. */
  leadId: string | null
  initial: PhoneValues | null
  pausing: boolean
  onBack: () => void
  onSaved: (id: string, values: PhoneValues) => void
}) {
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? '')
  const [same, setSame] = useState(initial?.same ?? true)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const input = {
      ...(leadId ? { id: leadId } : {}),
      phone,
      whatsapp: same ? undefined : whatsapp,
      sameAsPhone: same,
      items,
    }
    const check = phoneStepSchema.safeParse(input)
    if (!check.success) return setError(check.error.issues[0]?.message ?? 'Check your number')
    start(async () => {
      const r = await savePhoneStep(input)
      if (r.ok) onSaved(r.id, { phone, whatsapp, same })
      else setError(r.error)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Heading
        title="Where should we send your quotes?"
        lead="We will call or message you only about your solar plan."
        onBack={onBack}
      />
      <div>
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0803 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={field}
          autoFocus
        />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-base">
        <Checkbox checked={same} onCheckedChange={(v) => setSame(v === true)} />
        WhatsApp number is the same as my phone
      </label>
      {!same && (
        <div>
          <Label htmlFor="whatsapp">WhatsApp number</Label>
          <Input
            id="whatsapp"
            type="tel"
            inputMode="tel"
            placeholder="0803 123 4567"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className={field}
          />
        </div>
      )}
      <ErrorBox message={error} />
      <Button type="submit" className={primary} disabled={pending || pausing}>
        {pending || pausing ? 'Saving…' : 'Next'}
      </Button>
    </form>
  )
}

// ----------------------------------------------------------------- 5. Email
export function EmailStep({
  leadId,
  initial,
  pausing,
  onBack,
  onSaved,
}: {
  leadId: string
  initial: string
  pausing: boolean
  onBack: () => void
  onSaved: (email: string) => void
}) {
  const [email, setEmail] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const input = { id: leadId, email }
    const check = emailStepSchema.safeParse(input)
    if (!check.success) return setError(check.error.issues[0]?.message ?? 'Check your email')
    start(async () => {
      const r = await saveEmailStep(input)
      if (r.ok) onSaved(email)
      else setError(r.error)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Heading title="And your email?" lead="A copy of your estimate goes here." onBack={onBack} />
      <div>
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
          autoFocus
        />
      </div>
      <ErrorBox message={error} />
      <Button type="submit" className={primary} disabled={pending || pausing}>
        {pending || pausing ? 'Saving…' : 'Next'}
      </Button>
    </form>
  )
}

// ------------------------------------------------------------------ 6. Name
export type NameValues = {
  firstName: string
  surname: string
  state: NgStateId
  lga: string
}

/** All 36 states + FCT: launch states first, then a divider, then the rest A–Z. */
export function StateSelect({
  id,
  name,
  value,
  onChange,
}: {
  id: string
  name?: string
  value: NgStateId
  onChange: (state: NgStateId) => void
}) {
  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value as NgStateId)}
      className={select}
    >
      {STATE_GROUPS.map((g, i) => (
        <optgroup key={g.label} label={i === 0 ? g.label : `── ${g.label}`}>
          {g.ids.map((s) => (
            <option key={s} value={s}>
              {stateLabel(s)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export function NameStep({
  leadId,
  initial,
  onBack,
  onSaved,
}: {
  leadId: string
  initial: NameValues | null
  onBack: () => void
  onSaved: (values: NameValues, estimate: Estimate) => void
}) {
  const [values, setValues] = useState<NameValues>(
    initial ?? { firstName: '', surname: '', state: 'FCT', lga: '' },
  )
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const input = { id: leadId, ...values, consent }
    const check = nameStepSchema.safeParse(input)
    if (!check.success) return setError(check.error.issues[0]?.message ?? 'Check your details')
    start(async () => {
      const r = await saveNameStep(input)
      if (r.ok) onSaved(values, r.estimate)
      else setError(r.error)
    })
  }

  const set = (k: 'firstName' | 'surname' | 'lga') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }))

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Heading title="Who are we preparing this for?" onBack={onBack} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            autoComplete="given-name"
            value={values.firstName}
            onChange={set('firstName')}
            className={field}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="surname">Surname</Label>
          <Input
            id="surname"
            autoComplete="family-name"
            value={values.surname}
            onChange={set('surname')}
            className={field}
          />
        </div>
        <div>
          <Label htmlFor="state">State of installation</Label>
          <StateSelect
            id="state"
            value={values.state}
            onChange={(state) => setValues((v) => ({ ...v, state }))}
          />
        </div>
        <div>
          <Label htmlFor="lga">Local government area</Label>
          <Input
            id="lga"
            value={values.lga}
            onChange={set('lga')}
            placeholder="e.g. Gwarinpa"
            className={field}
          />
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <Checkbox
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          className="mt-0.5"
        />
        <span>{CONSENT_TEXT}</span>
      </label>
      <ErrorBox message={error} />
      <Button type="submit" className={primary} disabled={pending}>
        {pending ? 'Preparing your plans…' : 'Next'}
      </Button>
    </form>
  )
}

// ------------------------------------------------------- 7. Who is it for?
export function WhoForStep({
  leadId,
  onBack,
  onSaved,
}: {
  leadId: string
  onBack: () => void
  onSaved: (type: ApplicantType) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function choose(type: ApplicantType) {
    setError(null)
    if (type === 'business') return onSaved(type) // saved together with the business details
    start(async () => {
      const r = await saveApplicantStep({ id: leadId, applicantType: 'individual' })
      if (r.ok) onSaved(type)
      else setError(r.error)
    })
  }

  const card =
    'hover:border-brand-green focus-visible:ring-brand-green flex min-h-28 w-full flex-col items-start justify-center rounded-2xl border-2 border-transparent bg-brand-mist p-5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60'

  return (
    <div className="space-y-6">
      <Heading title="Who is this solar for?" onBack={onBack} />
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => choose('individual')}
          disabled={pending}
          className={card}
        >
          <span className="text-brand-dark text-xl font-bold">My home</span>
          <span className="text-muted-foreground mt-1 text-sm">
            A house or flat for my family and me.
          </span>
        </button>
        <button
          type="button"
          onClick={() => choose('business')}
          disabled={pending}
          className={card}
        >
          <span className="text-brand-dark text-xl font-bold">My business</span>
          <span className="text-muted-foreground mt-1 text-sm">
            A shop, office, school, clinic, hotel, workshop or other business.
          </span>
        </button>
      </div>
      <ErrorBox message={error} />
    </div>
  )
}

// ----------------------------------------------------- 8. Business details
export function BusinessStep({
  leadId,
  onBack,
  onSaved,
}: {
  leadId: string
  onBack: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const f = new FormData(e.currentTarget)
    const str = (k: string) => String(f.get(k) ?? '').trim()
    const num = (k: string) => (str(k) === '' ? Number.NaN : Number(str(k)))
    const business = {
      businessName: str('businessName'),
      businessType: str('businessType'),
      cacNumber: str('cacNumber'),
      contactRole: str('contactRole'),
      staffCount: num('staffCount'),
      hoursPerDay: num('hoursPerDay'),
      daysPerWeek: num('daysPerWeek'),
    }
    const check = businessSchema.safeParse(business)
    if (!check.success) return setError(check.error.issues[0]?.message ?? 'Check the details')
    start(async () => {
      const r = await saveApplicantStep({
        id: leadId,
        applicantType: 'business',
        business: check.data,
      })
      if (r.ok) onSaved()
      else setError(r.error)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Heading
        title="Tell us about your business"
        lead="This helps us size the system for your working hours and show what you save."
        onBack={onBack}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="businessName">Business name</Label>
          <Input
            id="businessName"
            name="businessName"
            autoComplete="organization"
            className={field}
            autoFocus
          />
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
          <Input id="cacNumber" name="cacNumber" placeholder="e.g. RC 1234567" className={field} />
        </div>
        <div>
          <Label htmlFor="contactRole">Your role</Label>
          <Input
            id="contactRole"
            name="contactRole"
            placeholder="e.g. owner, manager"
            className={field}
          />
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
      <ErrorBox message={error} />
      <Button type="submit" className={primary} disabled={pending}>
        {pending ? 'Saving…' : 'Next'}
      </Button>
    </form>
  )
}

// ----------------------------------------------------------------- 9. Plans
const PLAN_BLURB: Record<Plan, string> = {
  essential:
    'About 3 hours of backup at full load. Grid most days; solar for outages and evenings.',
  comfort: 'About 8 hours of backup at full load. Covers the evening and most of the night.',
  independence:
    'About 15 hours of backup at full load: runs through the night without grid or generator.',
}

export type PlanAdvice = {
  monthlySpend: number
  recommendedTenure: number | null
  co2AvoidedKgPerYear: number
}

/** Repayment and carbon advice for one plan, from the energy answers (null when unknown). */
export function adviceFor(
  estimate: PlanEstimate,
  current: CurrentEnergy | null,
  rates?: Record<TenureMonths, number>,
): PlanAdvice | null {
  if (!current) return null
  return {
    monthlySpend: current.monthlySpend,
    recommendedTenure: recommendTenure(monthlyByTenure(estimate, rates), current.monthlySpend),
    co2AvoidedKgPerYear: co2Avoided(estimate.plan, current),
  }
}

export function PlanCard({
  estimate,
  onChoose,
  busy,
  advice,
}: {
  estimate: PlanEstimate
  onChoose?: () => void
  busy?: boolean
  advice?: PlanAdvice | null
}) {
  const { plan, size, quote } = estimate
  const tonnes = advice ? Math.round(advice.co2AvoidedKgPerYear / 100) / 10 : null
  const Tag = onChoose ? 'button' : 'div'
  return (
    <Tag
      type={onChoose ? 'button' : undefined}
      onClick={onChoose}
      disabled={busy}
      className="hover:border-brand-green focus-visible:ring-brand-green relative w-full rounded-2xl border-2 border-transparent bg-white p-5 text-left shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
    >
      <span className="bg-brand-orange text-brand-dark absolute -top-3 right-5 rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase">
        Estimate
      </span>
      <p className="text-brand-green text-sm font-semibold tracking-wide uppercase">
        {PLAN_LABELS[plan]}
      </p>
      <p className="text-muted-foreground mt-1 text-sm">{PLAN_BLURB[plan]}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Inverter</dt>
          <dd className="font-semibold">{size.inverterKva} kVA</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Battery</dt>
          <dd className="font-semibold">{size.batteryKwh} kWh</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Panels</dt>
          <dd className="font-semibold">
            {size.panelCount} × {Math.round((size.panelKw * 1000) / size.panelCount)} W
          </dd>
        </div>
      </dl>
      <p className="text-brand-dark mt-4 text-2xl font-bold tracking-tight">
        {formatNaira(quote.monthly)}
        <span className="text-muted-foreground text-sm font-medium">
          {' '}
          / month for {quote.snapshot.tenureMonths} months
        </span>
      </p>
      <p className="text-muted-foreground text-sm">
        {formatNaira(quote.deposit)} upfront ({formatPercent(quote.snapshot.depositShare)}) · total{' '}
        {formatNaira(quote.systemPrice)} · 0% interest
      </p>
      {advice && (
        <div
          className="bg-brand-mist mt-3 space-y-1 rounded-lg p-3 text-sm"
          data-testid="plan-advice"
        >
          <p>
            You spend <strong>{formatNaira(advice.monthlySpend)}</strong> a month on power today ·
            this plan is <strong>{formatNaira(quote.monthly)}</strong> a month, then{' '}
            {formatNaira(0)}.
          </p>
          {advice.recommendedTenure !== null ? (
            <p className="text-brand-green font-semibold">
              <span className="bg-brand-green mr-1 rounded-full px-2 py-0.5 text-xs text-white uppercase">
                Pays for itself
              </span>
              over {advice.recommendedTenure} months at what you pay today.
            </p>
          ) : (
            <p className="text-muted-foreground">
              A higher upfront contribution would bring the monthly below what you pay today.
            </p>
          )}
          {tonnes !== null && tonnes > 0 && (
            <p className="text-brand-dark">
              Avoids about {tonnes} tonne{tonnes === 1 ? '' : 's'} of CO₂ a year.
            </p>
          )}
        </div>
      )}
      {onChoose && <p className="text-brand-blue mt-3 text-sm font-semibold">Choose this plan →</p>}
    </Tag>
  )
}

export function PlansStep({
  leadId,
  firstName,
  estimate,
  current,
  onBack,
  onChosen,
}: {
  leadId: string
  firstName: string
  estimate: Estimate
  current: CurrentEnergy | null
  onBack: () => void
  onChosen: (plan: Plan) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function choose(plan: Plan) {
    setError(null)
    start(async () => {
      const r = await savePlanStep({ id: leadId, plan })
      if (r.ok) onChosen(plan)
      else setError(r.error)
    })
  }

  return (
    <div className="space-y-6">
      <Heading
        title={`Here are your plans, ${firstName}`}
        onBack={onBack}
        lead="Estimates at a 20% deposit over 12 months. Backup hours assume every item is on at the same time, so you will usually get more."
      />
      {estimate.sample && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Prelaunch estimate using sample prices. Your final quote comes at launch.
        </p>
      )}
      <div className="space-y-5 pt-2">
        {PLANS.map((p) => (
          <PlanCard
            key={p}
            estimate={estimate.plans[p]}
            onChoose={() => choose(p)}
            busy={pending}
            advice={adviceFor(estimate.plans[p], current, estimate.pricingRateByTenure)}
          />
        ))}
      </div>
      <ErrorBox message={error} />
    </div>
  )
}

// -------------------------------------------------------- 10. Contribution
export function ContributionStep({
  leadId,
  estimate,
  plan,
  onBack,
  onDone,
}: {
  leadId: string
  estimate: Estimate
  plan: Plan
  onBack: () => void
  onDone: () => void
}) {
  const minPct = Math.round(estimate.plans[plan].quote.snapshot.minDepositShare * 100)
  const [pct, setPct] = useState(minPct)
  const [ready, setReady] = useState<(typeof READY_WHEN)[number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const priced = useMemo(() => repriceEstimate(estimate, plan, pct / 100), [estimate, plan, pct])

  function submit() {
    setError(null)
    if (!ready) return setError('Tell us when you can pay the upfront amount')
    start(async () => {
      const r = await completeWaitlist({ id: leadId, depositShare: pct / 100, readyWhen: ready })
      if (r.ok) onDone()
      else setError(r.error)
    })
  }

  return (
    <div className="space-y-6">
      <Heading
        title="How much can you pay upfront?"
        lead={`${PLAN_LABELS[plan]} plan. A bigger contribution lowers both the total and the monthly amount.`}
        onBack={onBack}
        backLabel="Choose a different plan"
      />

      <div className="bg-brand-mist rounded-2xl p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">Your contribution</span>
          <span
            className="text-brand-dark text-3xl font-bold tabular-nums"
            data-testid="deposit-pct"
          >
            {pct}%
          </span>
        </div>
        <Slider
          className="mt-4"
          min={minPct}
          max={95}
          step={1}
          value={[pct]}
          onValueChange={(v) => setPct(v[0] ?? minPct)}
          aria-label="Upfront contribution percentage"
        />
        <div className="text-muted-foreground mt-1 flex justify-between text-xs">
          <span>{minPct}%</span>
          <span>95%</span>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="text-brand-dark font-bold tabular-nums" data-testid="total-price">
              {formatNaira(priced.quote.systemPrice)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Upfront</dt>
            <dd className="text-brand-dark font-bold tabular-nums" data-testid="upfront">
              {formatNaira(priced.quote.deposit)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              Monthly × {priced.quote.snapshot.tenureMonths}
            </dt>
            <dd className="text-brand-dark font-bold tabular-nums" data-testid="monthly">
              {formatNaira(priced.quote.monthly)}
            </dd>
          </div>
        </dl>
        <p
          className="text-brand-green mt-4 text-base font-semibold"
          data-testid="saving"
          aria-live="polite"
        >
          {priced.savingVsMin > 0
            ? `You save ${formatNaira(priced.savingVsMin)} by paying ${pct}%.`
            : `Move the slider to see how much a bigger contribution saves you.`}
        </p>
      </div>

      <fieldset>
        <legend className="text-brand-dark text-lg font-semibold">When can you pay this?</legend>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {READY_WHEN.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReady(r)}
              aria-pressed={ready === r}
              className={`min-h-12 rounded-lg border-2 px-2 text-sm font-semibold transition-colors ${
                ready === r
                  ? 'border-brand-green bg-brand-green text-white'
                  : 'border-brand-mist text-brand-dark hover:border-brand-green bg-white'
              }`}
            >
              {READY_WHEN_LABELS[r]}
            </button>
          ))}
        </div>
      </fieldset>

      <ErrorBox message={error} />
      <Button type="button" className={primary} onClick={submit} disabled={pending}>
        {pending ? 'Saving…' : 'Next'}
      </Button>
    </div>
  )
}

// ------------------------------------------------------------ 11. Thank you
const REDIRECT_AFTER_MS = 5000

export function ThankYouStep({
  firstName,
  leadId,
  messagingLive,
  launchMode,
}: {
  firstName: string
  leadId: string
  /** True only when MESSAGING_PROVIDER is live: then a copy really was sent. */
  messagingLive: boolean
  launchMode: LaunchMode
}) {
  const router = useRouter()
  // Prelaunch: home after a few seconds. (Live mode leaves the flow for /plans after the energy screen.)
  const next = launchMode === 'live' ? `/plans?estimate=${leadId}` : '/'

  useEffect(() => {
    const t = window.setTimeout(() => router.push(next), REDIRECT_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [router, next])

  return (
    <div className="bg-brand-mist rounded-2xl p-8 text-center" role="status">
      <p className="text-brand-dark text-2xl font-bold sm:text-3xl">Thank you, {firstName}.</p>
      <p className="text-brand-dark mt-3 text-lg">
        We will get back to you within the next 7 days.
      </p>
      <p className="text-muted-foreground mt-4 text-sm">
        {messagingLive
          ? "We've sent a copy of your estimate to your email and WhatsApp."
          : 'We will contact you on WhatsApp within the next 7 days.'}
      </p>
      <Button asChild className="mt-6 h-12 text-base">
        <Link href={next}>
          {launchMode === 'live' ? 'Continue to my application' : 'Back to home'}
        </Link>
      </Button>
    </div>
  )
}

// -------------------------------------------------------- 9. Energy spend
export function EnergyStep({
  leadId,
  onBack,
  onSaved,
}: {
  leadId: string
  onBack: () => void
  onSaved: (current: CurrentEnergy | null) => void
}) {
  const [generator, setGenerator] = useState<GeneratorType | null>(null)
  const [fuel, setFuel] = useState<number | null>(null)
  const [grid, setGrid] = useState<number | null>(null)
  const [petrolPct, setPetrolPct] = useState(50)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const input = {
      id: leadId,
      generator,
      weeklyFuelNaira: generator === 'none' ? 0 : fuel,
      weeklyGridNaira: grid,
      petrolShare: generator === 'both' ? petrolPct / 100 : undefined,
    }
    const check = energyStepSchema.safeParse(input)
    if (!check.success) return setError(check.error.issues[0]?.message ?? 'Check your answers')
    start(async () => {
      const r = await saveEnergyStep(check.data)
      if (r.ok) onSaved(r.current)
      else setError(r.error)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Heading
        title="What do you pay for power today?"
        lead="So we can show what you save and which plan pays for itself."
        onBack={onBack}
      />

      <fieldset>
        <legend className="text-sm font-medium">What kind of generator do you run?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {GENERATOR_TYPES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGenerator(g)}
              aria-pressed={generator === g}
              className={`min-h-12 rounded-lg border-2 px-3 text-sm font-semibold transition-colors ${
                generator === g
                  ? 'border-brand-green bg-brand-green text-white'
                  : 'border-brand-mist text-brand-dark hover:border-brand-green bg-white'
              }`}
            >
              {GENERATOR_LABELS[g]}
            </button>
          ))}
        </div>
      </fieldset>

      {generator && generator !== 'none' && (
        <NairaInput
          id="weeklyFuel"
          label="How much do you spend on generator fuel in a typical week?"
          value={fuel}
          onChange={setFuel}
        />
      )}

      {generator === 'both' && (
        <div>
          <Label htmlFor="petrolShare">Roughly what share of your fuel money goes on petrol?</Label>
          <div className="mt-2 flex items-center gap-3">
            <Slider
              id="petrolShare"
              className="flex-1"
              min={0}
              max={100}
              step={5}
              value={[petrolPct]}
              onValueChange={(v) => setPetrolPct(v[0] ?? 50)}
              aria-label="Petrol share of fuel spend"
            />
            <span className="text-brand-dark w-12 text-right text-sm font-semibold tabular-nums">
              {petrolPct}%
            </span>
          </div>
        </div>
      )}

      <NairaInput
        id="weeklyGrid"
        label="How much do you spend on electricity (grid) bills in a typical week?"
        value={grid}
        onChange={setGrid}
        hint="Prepaid top-ups or your bill, whichever you pay."
      />

      <ErrorBox message={error} />
      <Button type="submit" className={primary} disabled={pending || generator === null}>
        {pending ? 'Saving…' : 'Next'}
      </Button>
    </form>
  )
}
