'use client'

import { Loader2, ScanFace } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { AgreementSigner } from '@/components/signature/AgreementSigner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StateSelect } from '@/components/waitlist/steps'
import type { GuarantorStepId } from '@/lib/agreements/guarantor'
import { GUARANTOR_TICKS } from '@/lib/agreements/ticks'
import { BIOMETRIC_CONSENT_TEXT } from '@/lib/consent/wording'
import { INCOME_RANGES } from '@/lib/applications/rules'
import type { NgStateId } from '@/lib/nigeria/states'

import {
  acceptGuarantee,
  declineGuarantee,
  finishGuarantorLiveness,
  giveGuarantorConsent,
  saveGuarantorAbout,
  sendGuarantorSignCode,
  signGuarantee,
  startGuarantorLiveness,
  verifyGuarantorNin,
} from '@/app/guarantee/[token]/actions'

type Result = { ok: true } | { ok: false; error: string }

const STEP_LABELS: Record<GuarantorStepId, string> = {
  intro: 'The request',
  nin: 'Your NIN',
  consent: 'Consent',
  face: 'Face check',
  about: 'About you',
  sign: 'Sign',
}
const ORDER: GuarantorStepId[] = ['intro', 'nin', 'consent', 'face', 'about', 'sign']
const PROMPTS = [
  'Look straight at the camera',
  'Turn your head slowly left',
  'Now turn right',
  'Blink twice',
]
const EMPLOYMENT = [
  ['employed', 'Employed'],
  ['self_employed', 'Self-employed'],
  ['business_owner', 'Business owner'],
  ['retired', 'Retired'],
  ['other', 'Other'],
] as const

const field = 'mt-1 h-12 text-base'
const select = 'border-input mt-1 h-12 w-full rounded-md border bg-white px-3 text-base'
const primary = 'bg-brand-green hover:bg-brand-dark h-14 w-full text-lg font-semibold'

export function GuarantorFlow({
  token,
  current,
  invitedName,
  applicantName,
  plan,
  faceStatus,
  text,
  phoneHint,
}: {
  token: string
  current: GuarantorStepId
  invitedName: string
  applicantName: string
  plan: { totalPayable: string; deposit: string; monthly: string; tenure: number }
  faceStatus: string | null
  text: string
  phoneHint: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'signed' | 'declined' | null>(null)

  function act(fn: () => Promise<Result>) {
    setError(null)
    start(async () => {
      const r = await fn()
      if (r.ok) router.refresh()
      else setError(r.error)
    })
  }

  if (done) {
    return (
      <section
        className="border-brand-green rounded-2xl border-2 p-6 text-center"
        data-testid={`guarantee-${done}`}
      >
        <h1 className="text-brand-dark text-xl font-bold">
          {done === 'signed' ? 'Thank you, you have signed' : 'Thank you for letting us know'}
        </h1>
        <p className="text-muted-foreground mt-2">
          {done === 'signed'
            ? 'We have emailed you a copy of the signed guarantee.'
            : `We have told ${applicantName} so they can ask someone else.`}
        </p>
      </section>
    )
  }

  const idx = ORDER.indexOf(current)
  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps">
        {ORDER.map((s, i) => (
          <li
            key={s}
            aria-current={s === current ? 'step' : undefined}
            className={`rounded-full px-3 py-1 ${i < idx ? 'bg-brand-mist text-brand-green' : s === current ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-500'}`}
          >
            {STEP_LABELS[s]}
          </li>
        ))}
      </ol>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {current === 'intro' && (
        <IntroStep
          invitedName={invitedName}
          applicantName={applicantName}
          plan={plan}
          pending={pending}
          onAccept={() => act(() => acceptGuarantee(token))}
          onDecline={(reason) => {
            setError(null)
            start(async () => {
              const r = await declineGuarantee(token, { reason })
              if (r.ok) setDone('declined')
              else setError(r.error)
            })
          }}
        />
      )}
      {current === 'nin' && (
        <NinStep pending={pending} onSubmit={(v) => act(() => verifyGuarantorNin(token, v))} />
      )}
      {current === 'consent' && (
        <ConsentStep
          pending={pending}
          onSubmit={(agree) => act(() => giveGuarantorConsent(token, { agree }))}
        />
      )}
      {current === 'face' && <FaceStep token={token} lastStatus={faceStatus} onError={setError} />}
      {current === 'about' && (
        <AboutStep pending={pending} onSubmit={(v) => act(() => saveGuarantorAbout(token, v))} />
      )}
      {current === 'sign' && (
        <div className="space-y-4">
          <h1 className="text-brand-dark text-2xl font-bold">Read and sign the guarantee</h1>
          <AgreementSigner
            text={text}
            ticks={[...GUARANTOR_TICKS]}
            defaultName={invitedName}
            phoneHint={phoneHint}
            sendCode={() => sendGuarantorSignCode(token)}
            sign={(payload) => signGuarantee(token, payload)}
            onSigned={() => setDone('signed')}
          />
        </div>
      )}
    </div>
  )
}

function IntroStep({
  invitedName,
  applicantName,
  plan,
  pending,
  onAccept,
  onDecline,
}: {
  invitedName: string
  applicantName: string
  plan: { totalPayable: string; deposit: string; monthly: string; tenure: number }
  pending: boolean
  onAccept: () => void
  onDecline: (reason: string) => void
}) {
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  return (
    <section className="space-y-4">
      <h1 className="text-brand-dark text-2xl font-bold">Hello {invitedName}</h1>
      <p>
        <strong>{applicantName}</strong> has asked you to be the guarantor for their Go4Solar solar
        payment plan.
      </p>
      <dl
        className="bg-brand-mist divide-y divide-white rounded-2xl"
        data-testid="guarantee-summary"
      >
        {(
          [
            ['Total amount payable', plan.totalPayable],
            ['Deposit', plan.deposit],
            ['Monthly payment', plan.monthly],
            ['Number of months', String(plan.tenure)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 px-4 py-3 text-sm">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-brand-dark font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm">
        No interest is charged. As guarantor, you agree to pay any overdue amounts if{' '}
        {applicantName} does not, after Go4Solar gives you written notice. It takes about 10
        minutes: your NIN, a face check, a few details and your signature.
      </p>
      {!declining ? (
        <div className="space-y-2">
          <Button type="button" className={primary} disabled={pending} onClick={onAccept}>
            {pending && <Loader2 className="mr-2 size-5 animate-spin" />}
            Yes, continue
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full"
            onClick={() => setDeclining(true)}
          >
            No, I can&apos;t be the guarantor
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="decline-reason">
            Please tell {applicantName} why (they will see this)
          </Label>
          <Input
            id="decline-reason"
            className={field}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            type="button"
            variant="destructive"
            className="h-12 w-full"
            disabled={pending}
            onClick={() => onDecline(reason)}
          >
            Decline the request
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => setDeclining(false)}
          >
            Back
          </Button>
        </div>
      )}
    </section>
  )
}

function NinStep({
  pending,
  onSubmit,
}: {
  pending: boolean
  onSubmit: (v: Record<string, string>) => void
}) {
  const [v, setV] = useState({ firstName: '', surname: '', dob: '', nin: '' })
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }))
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(v)
      }}
    >
      <h1 className="text-brand-dark text-2xl font-bold">Confirm who you are</h1>
      <p className="text-muted-foreground text-sm">
        A guarantor must be 18 or older and cannot be the customer. We never show your full NIN.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="g-first">First name (as on your NIN)</Label>
          <Input
            id="g-first"
            className={field}
            value={v.firstName}
            onChange={set('firstName')}
            autoComplete="given-name"
          />
        </div>
        <div>
          <Label htmlFor="g-surname">Surname</Label>
          <Input
            id="g-surname"
            className={field}
            value={v.surname}
            onChange={set('surname')}
            autoComplete="family-name"
          />
        </div>
        <div>
          <Label htmlFor="g-dob">Date of birth</Label>
          <Input id="g-dob" type="date" className={field} value={v.dob} onChange={set('dob')} />
        </div>
        <div>
          <Label htmlFor="g-nin">NIN (11 digits)</Label>
          <Input
            id="g-nin"
            inputMode="numeric"
            maxLength={11}
            className={field}
            value={v.nin}
            onChange={set('nin')}
            autoComplete="off"
          />
        </div>
      </div>
      <Button type="submit" className={primary} disabled={pending}>
        {pending && <Loader2 className="mr-2 size-5 animate-spin" />}
        Check my NIN
      </Button>
    </form>
  )
}

function ConsentStep({
  pending,
  onSubmit,
}: {
  pending: boolean
  onSubmit: (agree: boolean) => void
}) {
  const [agree, setAgree] = useState(false)
  return (
    <section className="space-y-4">
      <h1 className="text-brand-dark text-2xl font-bold">Your consent for the face check</h1>
      <div className="flex items-start gap-3">
        <Checkbox
          id="g-consent"
          checked={agree}
          onCheckedChange={(c) => setAgree(c === true)}
          className="mt-0.5"
        />
        <Label htmlFor="g-consent" className="text-sm leading-snug font-normal">
          {BIOMETRIC_CONSENT_TEXT}
        </Label>
      </div>
      <Button
        type="button"
        className={primary}
        disabled={!agree || pending}
        onClick={() => onSubmit(agree)}
      >
        Continue
      </Button>
    </section>
  )
}

function FaceStep({
  token,
  lastStatus,
  onError,
}: {
  token: string
  lastStatus: string | null
  onError: (e: string | null) => void
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<'idle' | 'guided' | 'checking' | 'hosted'>('idle')
  const [prompt, setPrompt] = useState(0)
  const [hostedUrl, setHostedUrl] = useState<string | null>(null)
  const sessionRef = useRef('')

  async function poll() {
    setPhase('checking')
    for (let i = 0; i < 30; i++) {
      const r = await finishGuarantorLiveness(token, { sessionId: sessionRef.current })
      if (!r.ok) {
        onError(r.error)
        setPhase('idle')
        router.refresh()
        return
      }
      if (!r.pending) return router.refresh()
      await new Promise((res) => setTimeout(res, 800))
    }
    onError('The check is taking longer than usual. Please try again.')
    setPhase('idle')
  }

  async function begin() {
    onError(null)
    const r = await startGuarantorLiveness(token)
    if (!r.ok) return onError(r.error)
    if (r.skipped) return router.refresh()
    sessionRef.current = r.sessionId
    if (r.sessionUrl) {
      setHostedUrl(r.sessionUrl)
      setPhase('hosted')
      return
    }
    setPhase('guided')
    for (let i = 0; i < PROMPTS.length; i++) {
      setPrompt(i)
      await new Promise((res) => setTimeout(res, 700))
    }
    await poll()
  }

  return (
    <section className="space-y-4">
      <h1 className="text-brand-dark text-2xl font-bold">Face check</h1>
      <p className="text-muted-foreground text-sm">
        Hold your phone at eye level in good light. It takes about 10 seconds.
      </p>
      {lastStatus && lastStatus !== 'passed' && (
        <p className="text-sm">Last result: {lastStatus.replace('_', ' ')}</p>
      )}
      <div
        className="bg-brand-mist flex min-h-56 flex-col items-center justify-center gap-4 rounded-2xl p-6 text-center"
        aria-live="polite"
      >
        {phase === 'idle' && <ScanFace className="text-brand-green h-16 w-16" aria-hidden />}
        {phase === 'guided' && (
          <>
            <ScanFace className="text-brand-green h-16 w-16 animate-pulse" aria-hidden />
            <p className="text-brand-dark text-xl font-bold">{PROMPTS[prompt]}</p>
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
              allow="camera"
              className="h-96 w-full rounded-xl border-0"
            />
            <Button type="button" onClick={poll}>
              I have finished the face check
            </Button>
          </>
        )}
      </div>
      {phase === 'idle' && (
        <Button type="button" className={primary} onClick={begin}>
          Start the face check
        </Button>
      )}
    </section>
  )
}

function AboutStep({
  pending,
  onSubmit,
}: {
  pending: boolean
  onSubmit: (v: Record<string, string>) => void
}) {
  const [v, setV] = useState({
    address: '',
    state: 'FCT' as NgStateId,
    employment: '',
    employer: '',
    incomeRange: '',
  })
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(v)
      }}
    >
      <h1 className="text-brand-dark text-2xl font-bold">About you</h1>
      <div>
        <Label htmlFor="g-address">Home address</Label>
        <Input
          id="g-address"
          className={field}
          value={v.address}
          onChange={(e) => setV({ ...v, address: e.target.value })}
          autoComplete="street-address"
        />
      </div>
      <div>
        <Label htmlFor="g-state">State</Label>
        <StateSelect id="g-state" value={v.state} onChange={(state) => setV({ ...v, state })} />
      </div>
      <div>
        <Label htmlFor="g-employment">Work</Label>
        <select
          id="g-employment"
          className={select}
          value={v.employment}
          onChange={(e) => setV({ ...v, employment: e.target.value })}
        >
          <option value="">Choose one</option>
          {EMPLOYMENT.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="g-employer">Employer or business name (optional)</Label>
        <Input
          id="g-employer"
          className={field}
          value={v.employer}
          onChange={(e) => setV({ ...v, employer: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="g-income">Monthly income</Label>
        <select
          id="g-income"
          className={select}
          value={v.incomeRange}
          onChange={(e) => setV({ ...v, incomeRange: e.target.value })}
        >
          <option value="">Choose a range</option>
          {INCOME_RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" className={primary} disabled={pending}>
        Continue to the guarantee
      </Button>
    </form>
  )
}
