'use client'

import { CheckCircle2, Loader2, ScanFace } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StateSelect } from '@/components/waitlist/steps'
import { INCOME_RANGES, STEP_LABELS, maskId, stepsFor, type StepId } from '@/lib/applications/rules'
import type { WizardState } from '@/lib/applications/server'
import { formatNaira, formatPercent } from '@/lib/money'
import type { NgStateId } from '@/lib/nigeria/states'
import { PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS } from '@/lib/waitlist/schema'

import {
  finishLiveness,
  finishReview,
  giveBiometricConsent,
  saveAddress,
  saveDetails,
  saveGuarantor,
  saveIncome,
  saveNextOfKin,
  startLiveness,
  uploadDocument,
  verifyBusiness,
  verifyBvn,
  verifyNin,
} from '@/app/(consumer)/app/apply/actions'

/** Exact consent wording (notes before Prompt 10). */
export const BIOMETRIC_CONSENT_TEXT =
  'I agree that Go4Solar and its verification partner may capture and process my face images and ID data to confirm my identity, as described in the Privacy Policy.'

const field = 'mt-1 h-12 text-base'
const select = 'border-input mt-1 h-12 w-full rounded-md border bg-white px-3 text-base'
const primary = 'h-14 w-full text-lg font-semibold'

type Act = (fn: () => Promise<{ ok: boolean; error?: string }>) => void

export function ApplyWizard({ state }: { state: WizardState }) {
  const router = useRouter()
  const [view, setView] = useState<StepId>(state.current)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const steps = stepsFor(state.applicantType)

  // After a save the server state moves on; follow it.
  const current = state.current
  useEffect(() => {
    setView(current)
  }, [current])

  const act: Act = (fn) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (r.ok) router.refresh()
      else setError(r.error ?? 'Something went wrong. Please try again.')
    })
  }

  const props = { state, act, pending }
  return (
    <div className="space-y-6">
      <div>
        <p className="text-brand-green text-sm font-semibold tracking-wide uppercase">
          {state.applicantType === 'business' ? 'Business application' : 'Your application'}
          {state.quote && ` · ${PLAN_LABELS[state.quote.plan]} · ${state.quote.reference}`}
        </p>
        <ol className="mt-3 flex gap-1" aria-label="Progress">
          {steps.map((s) => (
            <li key={s} className="flex-1">
              <button
                type="button"
                title={STEP_LABELS[s]}
                aria-label={STEP_LABELS[s]}
                aria-current={view === s ? 'step' : undefined}
                disabled={!state.steps[s] && s !== state.current}
                onClick={() => setView(s)}
                className={`block h-2 w-full rounded-full ${
                  state.steps[s]
                    ? 'bg-brand-green'
                    : s === view
                      ? 'bg-brand-orange'
                      : 'bg-brand-mist'
                }`}
              />
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground mt-2 text-xs">
          Step {steps.indexOf(view) + 1} of {steps.length} · {STEP_LABELS[view]}
        </p>
      </div>

      <section data-testid={`step-${view}`}>
        {view === 'details' && <DetailsStep {...props} />}
        {view === 'business' && <BusinessStep {...props} />}
        {view === 'nin' && <NinStep {...props} />}
        {view === 'bvn' && <BvnStep {...props} />}
        {view === 'consent' && <ConsentStep {...props} />}
        {view === 'face' && <FaceStep {...props} />}
        {view === 'address' && <AddressStep {...props} />}
        {view === 'income' && <IncomeStep {...props} />}
        {view === 'nextOfKin' && <PersonStep kind="nextOfKin" {...props} />}
        {view === 'guarantor' && <PersonStep kind="guarantor" {...props} />}
        {view === 'review' && <ReviewStep {...props} />}
      </section>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

type StepProps = { state: WizardState; act: Act; pending: boolean }

function Heading({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-brand-dark text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {lead && <p className="text-muted-foreground mt-2 text-base">{lead}</p>}
    </div>
  )
}

function Status({ status }: { status?: string }) {
  if (!status) return null
  const map: Record<string, [string, string]> = {
    passed: ['Confirmed', 'bg-brand-green text-white'],
    failed: ['Not confirmed', 'bg-red-100 text-red-800'],
    manual_review: ['With our team for review', 'bg-amber-100 text-amber-900'],
    pending: ['Checking…', 'bg-gray-100 text-gray-700'],
  }
  const [label, cls] = map[status] ?? [status, 'bg-gray-100']
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
}

/** Uploads straight to the private 'kyc' bucket through a server action. Files are never shown back. */
function DocUpload({
  kind,
  label,
  hint,
  state,
  act,
}: { kind: string; label: string; hint?: string } & StepProps) {
  const ref = useRef<HTMLInputElement>(null)
  const done = state.documents.includes(kind)
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-brand-dark text-sm font-semibold">{label}</p>
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </div>
        {done && (
          <span
            className="text-brand-green inline-flex items-center gap-1 text-sm font-semibold"
            data-testid={`uploaded-${kind}`}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Uploaded
          </span>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        aria-label={label}
        className="mt-3 block w-full text-sm"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const fd = new FormData()
          fd.append('kind', kind)
          fd.append('file', file)
          act(() => uploadDocument(fd))
          if (ref.current) ref.current.value = ''
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------- details
function DetailsStep({ state, act, pending }: StepProps) {
  const p = state.personal
  const b = state.business
  const [v, setV] = useState({
    firstName: p.firstName ?? '',
    surname: p.surname ?? '',
    dob: p.dob ?? '',
    state: (p.state ?? 'FCT') as NgStateId,
    lga: p.lga ?? '',
  })
  const [biz, setBiz] = useState({
    businessName: b?.businessName ?? '',
    businessType: b?.businessType ?? 'shop',
    contactRole: b?.contactRole ?? '',
    staffCount: String(b?.staffCount ?? ''),
    hoursPerDay: String(b?.hoursPerDay ?? ''),
    daysPerWeek: String(b?.daysPerWeek ?? ''),
  })
  const isBiz = state.applicantType === 'business'
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        act(() =>
          saveDetails({
            ...v,
            business: isBiz
              ? {
                  ...biz,
                  staffCount: Number(biz.staffCount),
                  hoursPerDay: Number(biz.hoursPerDay),
                  daysPerWeek: Number(biz.daysPerWeek),
                }
              : undefined,
          }),
        )
      }}
      className="space-y-5"
    >
      <Heading
        title="Confirm your details"
        lead="We filled in what you already told us. Change anything that is not right."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="d-first">First name</Label>
          <Input
            id="d-first"
            value={v.firstName}
            onChange={(e) => setV({ ...v, firstName: e.target.value })}
            className={field}
          />
        </div>
        <div>
          <Label htmlFor="d-surname">Surname</Label>
          <Input
            id="d-surname"
            value={v.surname}
            onChange={(e) => setV({ ...v, surname: e.target.value })}
            className={field}
          />
        </div>
        <div>
          <Label htmlFor="d-dob">Date of birth</Label>
          <Input
            id="d-dob"
            type="date"
            value={v.dob}
            onChange={(e) => setV({ ...v, dob: e.target.value })}
            className={field}
          />
        </div>
        <div>
          <Label>Phone (verified)</Label>
          <p className="bg-brand-mist mt-1 flex h-12 items-center rounded-md px-3 text-base">
            {p.phone ?? '—'}
          </p>
        </div>
        <div className="sm:col-span-2">
          <Label>Email</Label>
          <p className="bg-brand-mist mt-1 flex h-12 items-center rounded-md px-3 text-base">
            {p.email ?? '—'}
          </p>
        </div>
        <div>
          <Label htmlFor="d-state">State</Label>
          <StateSelect id="d-state" value={v.state} onChange={(s) => setV({ ...v, state: s })} />
        </div>
        <div>
          <Label htmlFor="d-lga">LGA</Label>
          <Input
            id="d-lga"
            value={v.lga}
            onChange={(e) => setV({ ...v, lga: e.target.value })}
            className={field}
          />
        </div>
      </div>

      {isBiz && (
        <div className="grid gap-4 sm:grid-cols-2">
          <h2 className="text-brand-dark text-lg font-semibold sm:col-span-2">Your business</h2>
          <div className="sm:col-span-2">
            <Label htmlFor="d-bname">Business name</Label>
            <Input
              id="d-bname"
              value={biz.businessName}
              onChange={(e) => setBiz({ ...biz, businessName: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <Label htmlFor="d-btype">Type of business</Label>
            <select
              id="d-btype"
              value={biz.businessType}
              onChange={(e) =>
                setBiz({ ...biz, businessType: e.target.value as typeof biz.businessType })
              }
              className={select}
            >
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BUSINESS_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="d-role">Your role</Label>
            <Input
              id="d-role"
              value={biz.contactRole}
              onChange={(e) => setBiz({ ...biz, contactRole: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <Label htmlFor="d-staff">Number of staff</Label>
            <Input
              id="d-staff"
              inputMode="numeric"
              value={biz.staffCount}
              onChange={(e) => setBiz({ ...biz, staffCount: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <Label htmlFor="d-hours">Hours per day</Label>
            <Input
              id="d-hours"
              inputMode="decimal"
              value={biz.hoursPerDay}
              onChange={(e) => setBiz({ ...biz, hoursPerDay: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <Label htmlFor="d-days">Days per week</Label>
            <Input
              id="d-days"
              inputMode="numeric"
              value={biz.daysPerWeek}
              onChange={(e) => setBiz({ ...biz, daysPerWeek: e.target.value })}
              className={field}
            />
          </div>
        </div>
      )}

      {state.energy?.monthlySpend != null && (
        <p className="bg-brand-mist rounded-lg px-4 py-3 text-sm">
          Power today: about <strong>{formatNaira(state.energy.monthlySpend)}</strong> a month (from
          your earlier answers).
        </p>
      )}
      <Button type="submit" className={primary} disabled={pending}>
        {pending ? 'Saving…' : 'These are correct'}
      </Button>
    </form>
  )
}

// --------------------------------------------------------------- business
function BusinessStep(props: StepProps) {
  const { state, act, pending } = props
  const [rc, setRc] = useState(state.business?.rcNumber ?? '')
  const [director, setDirector] = useState(Boolean(state.business?.directorConfirmed))
  return (
    <div className="space-y-5">
      <Heading
        title="Business verification"
        lead="We confirm your company with the Corporate Affairs Commission (CAC)."
      />
      <DocUpload
        kind="cac_certificate"
        label="CAC certificate"
        hint="Photo or PDF of the certificate of incorporation or business name registration."
        {...props}
      />
      <div>
        <Label htmlFor="b-rc">CAC number</Label>
        <Input
          id="b-rc"
          placeholder="e.g. RC123456"
          value={rc}
          onChange={(e) => setRc(e.target.value)}
          className={field}
        />
        <div className="mt-2">
          <Status status={state.checks.cac?.status} />
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <Checkbox
          checked={director}
          onCheckedChange={(v) => setDirector(v === true)}
          className="mt-0.5"
        />
        <span>I am a director or authorised signatory of this business.</span>
      </label>
      <Button
        type="button"
        className={primary}
        disabled={pending}
        onClick={() => act(() => verifyBusiness({ rcNumber: rc, directorConfirmed: director }))}
      >
        {pending ? 'Checking…' : 'Verify my business'}
      </Button>
    </div>
  )
}

// -------------------------------------------------------------------- NIN
function NinStep(props: StepProps) {
  const { state, act, pending } = props
  const [nin, setNin] = useState('')
  return (
    <div className="space-y-5">
      <Heading
        title="Your NIN"
        lead="Your National Identification Number. We only keep the last 4 digits."
      />
      <DocUpload kind="nin_front" label="Front of your NIN slip or card" {...props} />
      <DocUpload kind="nin_back" label="Back of your NIN card (if you have the card)" {...props} />
      <div>
        <Label htmlFor="nin">NIN (11 digits)</Label>
        <Input
          id="nin"
          inputMode="numeric"
          autoComplete="off"
          maxLength={11}
          value={nin}
          onChange={(e) => setNin(e.target.value.replace(/\D/g, ''))}
          className={field}
        />
        <p className="text-muted-foreground mt-1 text-xs">
          On file: {maskId(state.personal.ninLast4)} <Status status={state.checks.nin?.status} />
        </p>
      </div>
      <Button
        type="button"
        className={primary}
        disabled={pending}
        onClick={() => act(() => verifyNin({ nin }))}
      >
        {pending ? 'Checking…' : 'Verify my NIN'}
      </Button>
    </div>
  )
}

// -------------------------------------------------------------------- BVN
function BvnStep({ state, act, pending }: StepProps) {
  const [bvn, setBvn] = useState('')
  return (
    <div className="space-y-5">
      <Heading
        title="Your BVN"
        lead="Your Bank Verification Number confirms your name and date of birth. It gives no one access to your account."
      />
      <div>
        <Label htmlFor="bvn">BVN (11 digits)</Label>
        <Input
          id="bvn"
          inputMode="numeric"
          autoComplete="off"
          maxLength={11}
          value={bvn}
          onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))}
          className={field}
        />
        <p className="text-muted-foreground mt-1 text-xs">
          On file: {maskId(state.personal.bvnLast4)} <Status status={state.checks.bvn?.status} />
        </p>
      </div>
      <Button
        type="button"
        className={primary}
        disabled={pending}
        onClick={() => act(() => verifyBvn({ bvn }))}
      >
        {pending ? 'Checking…' : 'Verify my BVN'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------- consent
function ConsentStep({ act, pending }: StepProps) {
  const [agree, setAgree] = useState(false)
  return (
    <div className="space-y-5">
      <Heading
        title="Your consent for the face check"
        lead="Next we take a short video selfie to confirm it really is you."
      />
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <Checkbox
          checked={agree}
          onCheckedChange={(v) => setAgree(v === true)}
          className="mt-0.5"
          aria-label="Biometric consent"
        />
        <span>{BIOMETRIC_CONSENT_TEXT}</span>
      </label>
      <Button
        type="button"
        className={primary}
        disabled={pending || !agree}
        onClick={() => act(() => giveBiometricConsent({ agree }))}
      >
        I agree
      </Button>
    </div>
  )
}

// ------------------------------------------------------------------- face
const PROMPTS = [
  'Look straight at the camera',
  'Slowly turn your head left',
  'Now turn your head right',
  'Blink twice',
]

function FaceStep({ state, act, pending }: StepProps) {
  const [phase, setPhase] = useState<'idle' | 'guided' | 'checking' | 'hosted'>('idle')
  const [prompt, setPrompt] = useState(0)
  const [hostedUrl, setHostedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<string>('')
  const router = useRouter()

  async function poll() {
    setPhase('checking')
    for (let i = 0; i < 30; i++) {
      const r = await finishLiveness({ sessionId: sessionRef.current })
      if (!r.ok) {
        setError(r.error)
        setPhase('idle')
        router.refresh()
        return
      }
      if (!r.pending) {
        router.refresh()
        return
      }
      await new Promise((res) => setTimeout(res, 800))
    }
    setError('The check is taking longer than usual. Please try again.')
    setPhase('idle')
  }

  async function begin() {
    setError(null)
    const r = await startLiveness()
    if (!r.ok) return setError(r.error)
    if (r.skipped) return router.refresh()
    sessionRef.current = r.sessionId
    if (r.sessionUrl) {
      setHostedUrl(r.sessionUrl)
      setPhase('hosted')
      return
    }
    // Mock (and SDK-token) flow: the same guided screens the provider SDK shows.
    setPhase('guided')
    for (let i = 0; i < PROMPTS.length; i++) {
      setPrompt(i)
      await new Promise((res) => setTimeout(res, 700))
    }
    await poll()
  }

  return (
    <div className="space-y-5">
      <Heading
        title="Face check"
        lead="Hold your phone at eye level in good light. It takes about 10 seconds."
      />
      {state.checks.liveness && (
        <p className="text-sm">
          Last result: <Status status={state.checks.liveness.status} />
        </p>
      )}
      <div
        className="bg-brand-mist flex min-h-56 flex-col items-center justify-center gap-4 rounded-2xl p-6 text-center"
        aria-live="polite"
      >
        {phase === 'idle' && <ScanFace className="text-brand-green h-16 w-16" aria-hidden />}
        {phase === 'guided' && (
          <>
            <ScanFace className="text-brand-green h-16 w-16 animate-pulse" aria-hidden />
            <p className="text-brand-dark text-xl font-bold" data-testid="face-prompt">
              {PROMPTS[prompt]}
            </p>
          </>
        )}
        {phase === 'checking' && (
          <>
            <Loader2 className="text-brand-green h-12 w-12 animate-spin" aria-hidden />
            <p className="text-brand-dark font-semibold">Checking it&apos;s you…</p>
          </>
        )}
        {phase === 'hosted' && hostedUrl && (
          <>
            <iframe
              src={hostedUrl}
              title="Face check"
              className="h-96 w-full rounded-lg border-0"
              allow="camera"
            />
            <Button type="button" onClick={() => void poll()}>
              I&apos;ve finished
            </Button>
          </>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {phase === 'idle' && (
        <Button
          type="button"
          className={primary}
          disabled={pending}
          onClick={() => act(async () => (await begin(), { ok: true }))}
        >
          Start the face check
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- address
function AddressStep(props: StepProps) {
  const { state, act, pending } = props
  const a = (state.installAddress ?? {}) as Record<string, string>
  const [v, setV] = useState({
    line1: a.line1 ?? '',
    city: a.city ?? '',
    state: (a.state ?? state.personal.state ?? 'FCT') as NgStateId,
    lga: a.lga ?? state.personal.lga ?? '',
    lat: '',
    lng: '',
  })
  const isBiz = state.applicantType === 'business'
  return (
    <div className="space-y-5">
      <Heading
        title={isBiz ? 'Business address and site' : 'Address and site'}
        lead="Where the system will be installed."
      />
      <DocUpload
        kind="address_proof"
        label={isBiz ? 'Proof of business address' : 'Proof of address'}
        hint="A recent utility bill or your tenancy agreement."
        {...props}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="a-line1">Street address</Label>
          <Input
            id="a-line1"
            value={v.line1}
            onChange={(e) => setV({ ...v, line1: e.target.value })}
            className={field}
          />
        </div>
        <div>
          <Label htmlFor="a-city">Town or city</Label>
          <Input
            id="a-city"
            value={v.city}
            onChange={(e) => setV({ ...v, city: e.target.value })}
            className={field}
          />
        </div>
        <div>
          <Label htmlFor="a-lga">LGA</Label>
          <Input
            id="a-lga"
            value={v.lga}
            onChange={(e) => setV({ ...v, lga: e.target.value })}
            className={field}
          />
        </div>
        <div>
          <Label htmlFor="a-state">State</Label>
          <StateSelect id="a-state" value={v.state} onChange={(s) => setV({ ...v, state: s })} />
        </div>
      </div>
      <div className="rounded-xl border p-4">
        <p className="text-brand-dark text-sm font-semibold">Map pin (optional)</p>
        <p className="text-muted-foreground text-xs">
          Helps the installer find you. Use your location if you are at the site, or type the
          coordinates.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Input
            aria-label="Latitude"
            placeholder="Latitude"
            inputMode="decimal"
            value={v.lat}
            onChange={(e) => setV({ ...v, lat: e.target.value })}
          />
          <Input
            aria-label="Longitude"
            placeholder="Longitude"
            inputMode="decimal"
            value={v.lng}
            onChange={(e) => setV({ ...v, lng: e.target.value })}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() =>
            navigator.geolocation?.getCurrentPosition((pos) =>
              setV((x) => ({
                ...x,
                lat: pos.coords.latitude.toFixed(6),
                lng: pos.coords.longitude.toFixed(6),
              })),
            )
          }
        >
          Use my location
        </Button>
      </div>
      <Button
        type="button"
        className={primary}
        disabled={pending}
        onClick={() =>
          act(() =>
            saveAddress({
              line1: v.line1,
              city: v.city,
              state: v.state,
              lga: v.lga,
              lat: v.lat ? Number(v.lat) : null,
              lng: v.lng ? Number(v.lng) : null,
            }),
          )
        }
      >
        Save address
      </Button>
    </div>
  )
}

// ----------------------------------------------------------------- income
function IncomeStep(props: StepProps) {
  const { state, act, pending } = props
  const e = (state.employment ?? {}) as Record<string, string>
  const [range, setRange] = useState(state.incomeRange ?? '')
  const [status, setStatus] = useState(e.status ?? '')
  const [employer, setEmployer] = useState(e.employer ?? '')
  const [jobTitle, setJobTitle] = useState(e.jobTitle ?? '')
  const isBiz = state.applicantType === 'business'
  return (
    <div className="space-y-5">
      <Heading
        title={isBiz ? 'Business income' : 'Income and work'}
        lead={
          isBiz
            ? 'Six months of the business bank statements and its typical monthly income.'
            : 'So we can be sure the monthly payment is comfortable for you.'
        }
      />
      {isBiz ? (
        <DocUpload
          kind="business_statement"
          label="Business bank statements (last 6 months, PDF)"
          {...props}
        />
      ) : (
        <>
          <div>
            <Label htmlFor="i-status">How do you earn your income?</Label>
            <select
              id="i-status"
              value={status}
              onChange={(ev) => setStatus(ev.target.value)}
              className={select}
            >
              <option value="">Choose…</option>
              <option value="employed">Employed</option>
              <option value="self_employed">Self-employed</option>
              <option value="business_owner">Business owner</option>
              <option value="retired">Retired / pension</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="i-employer">Employer or business (optional)</Label>
              <Input
                id="i-employer"
                value={employer}
                onChange={(ev) => setEmployer(ev.target.value)}
                className={field}
              />
            </div>
            <div>
              <Label htmlFor="i-title">Job title (optional)</Label>
              <Input
                id="i-title"
                value={jobTitle}
                onChange={(ev) => setJobTitle(ev.target.value)}
                className={field}
              />
            </div>
          </div>
          <DocUpload
            kind="bank_statement"
            label="Bank statements, last 6 months (optional, PDF)"
            hint="Uploading these can speed up your approval."
            {...props}
          />
        </>
      )}
      <div>
        <Label htmlFor="i-range">
          {isBiz ? 'Typical monthly income of the business' : 'Your monthly income'}
        </Label>
        <select
          id="i-range"
          value={range}
          onChange={(ev) => setRange(ev.target.value)}
          className={select}
        >
          <option value="">Choose a range…</option>
          {INCOME_RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="button"
        className={primary}
        disabled={pending}
        onClick={() =>
          act(() =>
            saveIncome({
              incomeRange: range || undefined,
              employmentStatus: isBiz ? undefined : status || undefined,
              employer: employer || undefined,
              jobTitle: jobTitle || undefined,
            }),
          )
        }
      >
        Save
      </Button>
    </div>
  )
}

// ----------------------------------------------- next of kin / guarantor
function PersonStep({
  kind,
  state,
  act,
  pending,
}: StepProps & { kind: 'nextOfKin' | 'guarantor' }) {
  const saved = ((kind === 'guarantor' ? state.guarantor : state.nextOfKin) ?? {}) as Record<
    string,
    string
  >
  const [v, setV] = useState({
    name: saved.name ?? '',
    phone: saved.phone ?? '',
    email: saved.email ?? '',
    relationship: saved.relationship ?? '',
  })
  const g = kind === 'guarantor'
  return (
    <div className="space-y-5">
      <Heading
        title={g ? 'Your guarantor' : 'Next of kin'}
        lead={
          g
            ? 'Someone who agrees to cover the payments if you cannot. We send them a secure link to confirm; they verify their own identity.'
            : 'Someone we can contact if we cannot reach you.'
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`${kind}-name`}>Full name</Label>
          <Input
            id={`${kind}-name`}
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            className={field}
          />
        </div>
        <div>
          <Label htmlFor={`${kind}-phone`}>Phone</Label>
          <Input
            id={`${kind}-phone`}
            type="tel"
            inputMode="tel"
            value={v.phone}
            onChange={(e) => setV({ ...v, phone: e.target.value })}
            className={field}
          />
        </div>
        {g && (
          <div>
            <Label htmlFor={`${kind}-email`}>Email</Label>
            <Input
              id={`${kind}-email`}
              type="email"
              value={v.email}
              onChange={(e) => setV({ ...v, email: e.target.value })}
              className={field}
            />
          </div>
        )}
        <div>
          <Label htmlFor={`${kind}-rel`}>Relationship to you</Label>
          <Input
            id={`${kind}-rel`}
            placeholder="e.g. brother, employer"
            value={v.relationship}
            onChange={(e) => setV({ ...v, relationship: e.target.value })}
            className={field}
          />
        </div>
      </div>
      <Button
        type="button"
        className={primary}
        disabled={pending}
        onClick={() =>
          act(() =>
            g
              ? saveGuarantor(v)
              : saveNextOfKin({ name: v.name, phone: v.phone, relationship: v.relationship }),
          )
        }
      >
        Save
      </Button>
    </div>
  )
}

// ----------------------------------------------------------------- review
function ReviewStep({ state, act, pending }: StepProps) {
  const a = (state.affordability ?? {}) as {
    incomeRatio?: number | null
    incomeFlag?: boolean
    energyRatio?: number | null
    paysForItself?: boolean | null
  }
  const done = Boolean(state.steps.review)
  return (
    <div className="space-y-5">
      <Heading title={done ? 'Application ready' : 'Review your application'} />
      {state.quote && (
        <div className="bg-brand-mist rounded-2xl p-5 text-sm">
          <p className="text-brand-dark text-base font-semibold">
            {PLAN_LABELS[state.quote.plan]} plan · {state.quote.reference}
          </p>
          <p className="mt-1">
            {formatNaira(state.quote.deposit)} upfront, then {formatNaira(state.quote.monthly)} a
            month for {state.quote.tenure} months. Total amount payable{' '}
            {formatNaira(state.quote.systemPrice)} · 0% interest.
          </p>
          {a.paysForItself && (
            <p className="text-brand-green mt-2 font-semibold">
              Pays for itself: the monthly is below what you spend on power today.
            </p>
          )}
          {typeof a.incomeRatio === 'number' && (
            <p className="text-muted-foreground mt-1">
              Monthly payment is about {formatPercent(a.incomeRatio)} of your monthly income.
            </p>
          )}
        </div>
      )}
      <ul className="space-y-1 text-sm">
        <li>
          NIN {maskId(state.personal.ninLast4)} <Status status={state.checks.nin?.status} />
        </li>
        <li>
          BVN {maskId(state.personal.bvnLast4)} <Status status={state.checks.bvn?.status} />
        </li>
        <li>
          Face check{' '}
          <Status
            status={
              state.checks.liveness?.status ?? (state.steps.face ? 'manual_review' : undefined)
            }
          />
        </li>
        {state.applicantType === 'business' && (
          <li>
            CAC {state.business?.rcNumber ?? '—'} <Status status={state.checks.cac?.status} />
          </li>
        )}
        <li>Documents: {state.documents.length} uploaded</li>
      </ul>
      {state.missing.length > 0 && !done && (
        <Alert>
          <AlertDescription>
            Still to do:{' '}
            {state.missing.map((m) => m.replace(/^step:/, '').replace(/_/g, ' ')).join(', ')}.
          </AlertDescription>
        </Alert>
      )}
      {done ? (
        <div className="border-brand-green rounded-2xl border-2 p-5" data-testid="next-sign">
          <p className="text-brand-dark text-lg font-bold">Next: sign your agreement</p>
          <p className="text-muted-foreground mt-1 text-sm">
            We have sent your guarantor a link. Now read and sign your payment plan agreement.
          </p>
          <Button asChild className={`${primary} bg-brand-green hover:bg-brand-dark mt-4`}>
            <Link href="/app/apply/sign">Read and sign</Link>
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          className={primary}
          disabled={pending || state.missing.length > 0}
          onClick={() => act(() => finishReview())}
        >
          Confirm my application
        </Button>
      )}
    </div>
  )
}
