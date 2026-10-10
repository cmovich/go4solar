'use client'

import { Loader2 } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadItem } from '@/lib/load/types'
import { formatNaira, formatPercent } from '@/lib/money'
import {
  PLANS,
  PLAN_LABELS,
  repriceEstimate,
  type Estimate,
  type PlanEstimate,
} from '@/lib/quotes/buildEstimate'
import type { Plan } from '@/lib/sizing/types'
import {
  CONSENT_TEXT,
  ESTIMATE_STATES,
  READY_WHEN,
  READY_WHEN_LABELS,
  STATE_LABELS,
  emailStepSchema,
  nameStepSchema,
  phoneStepSchema,
} from '@/lib/waitlist/schema'

import {
  completeWaitlist,
  saveEmailStep,
  saveNameStep,
  savePhoneStep,
  savePlanStep,
} from '@/app/(public)/waitlist/actions'

const n = (v: number) => v.toLocaleString('en-US')
const field = 'mt-1 h-12 text-base'
const primary = 'h-14 w-full text-lg font-semibold'

function Heading({ title, lead }: { title: string; lead?: string }) {
  return (
    <div>
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
      <button type="button" onClick={onBack} className="text-brand-blue block text-sm underline">
        Back to my appliances
      </button>
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
export function PhoneStep({
  items,
  pausing,
  onSaved,
}: {
  items: LoadItem[]
  pausing: boolean
  onSaved: (id: string) => void
}) {
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [same, setSame] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const input = { phone, whatsapp: same ? undefined : whatsapp, sameAsPhone: same, items }
    const check = phoneStepSchema.safeParse(input)
    if (!check.success) return setError(check.error.issues[0]?.message ?? 'Check your number')
    start(async () => {
      const r = await savePhoneStep(input)
      if (r.ok) onSaved(r.id)
      else setError(r.error)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Heading
        title="Where should we send your quotes?"
        lead="We will call or message you only about your solar plan."
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
  pausing,
  onSaved,
}: {
  leadId: string
  pausing: boolean
  onSaved: () => void
}) {
  const [email, setEmail] = useState('')
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
      if (r.ok) onSaved()
      else setError(r.error)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Heading title="And your email?" lead="A copy of your estimate goes here." />
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
  state: (typeof ESTIMATE_STATES)[number]
  lga: string
}

export function NameStep({
  leadId,
  onSaved,
}: {
  leadId: string
  onSaved: (values: NameValues, estimate: Estimate) => void
}) {
  const [values, setValues] = useState<NameValues>({
    firstName: '',
    surname: '',
    state: 'FCT',
    lga: '',
  })
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

  const set =
    (k: keyof NameValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [k]: e.target.value }))

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Heading title="Who are we preparing this for?" />
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
          <select
            id="state"
            value={values.state}
            onChange={set('state')}
            className="border-input mt-1 h-12 w-full rounded-md border bg-white px-3 text-base"
          >
            {ESTIMATE_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_LABELS[s]}
              </option>
            ))}
          </select>
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
        {pending ? 'Preparing your plans…' : 'See my plans'}
      </Button>
    </form>
  )
}

// ----------------------------------------------------------------- 7. Plans
const PLAN_BLURB: Record<Plan, string> = {
  essential:
    'About 3 hours of backup at full load. Grid most days; solar for outages and evenings.',
  comfort: 'About 8 hours of backup at full load. Covers the evening and most of the night.',
  independence: 'Runs day and night without grid or generator, sized from your real daily use.',
}

export function PlanCard({
  estimate,
  onChoose,
  busy,
}: {
  estimate: PlanEstimate
  onChoose?: () => void
  busy?: boolean
}) {
  const { plan, size, quote } = estimate
  const Tag = onChoose ? 'button' : 'div'
  return (
    <Tag
      type={onChoose ? 'button' : undefined}
      onClick={onChoose}
      disabled={busy}
      className="hover:border-brand-green focus-visible:ring-brand-green relative w-full rounded-2xl border-2 border-transparent bg-white p-5 text-left shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
    >
      <span className="bg-brand-orange absolute -top-3 right-5 rounded-full px-3 py-1 text-xs font-bold tracking-wide text-white uppercase">
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
      {onChoose && <p className="text-brand-blue mt-3 text-sm font-semibold">Choose this plan →</p>}
    </Tag>
  )
}

export function PlansStep({
  leadId,
  firstName,
  estimate,
  onChosen,
}: {
  leadId: string
  firstName: string
  estimate: Estimate
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
          />
        ))}
      </div>
      <ErrorBox message={error} />
    </div>
  )
}

// --------------------------------------------------------- 8. Contribution
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
      <button type="button" onClick={onBack} className="text-brand-blue block text-sm underline">
        Choose a different plan
      </button>
    </div>
  )
}

// ------------------------------------------------------------- 9. Thank you
export function ThankYouStep({ firstName }: { firstName: string }) {
  return (
    <div className="bg-brand-mist rounded-2xl p-8 text-center" role="status">
      <p className="text-brand-dark text-2xl font-bold sm:text-3xl">Thank you, {firstName}.</p>
      <p className="text-brand-dark mt-3 text-lg">
        You are on the Go4Solar waiting list. We will notify you within the next 7 days.
      </p>
      <p className="text-muted-foreground mt-4 text-sm">
        A copy of your estimate is on its way to your email and WhatsApp.
      </p>
    </div>
  )
}
