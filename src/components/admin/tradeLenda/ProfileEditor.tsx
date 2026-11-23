'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatNaira, formatPercent } from '@/lib/money'
import { stateLabel, type NgStateId } from '@/lib/nigeria/states'
import {
  LENDING_TYPE_LABELS,
  type LendingFigures,
  type LendingType,
} from '@/lib/tradeLenda/figures'
import { INCOME_RANGES } from '@/lib/applications/rules'
import { EMPLOYMENT_LABELS, EMPLOYMENT_TYPES } from '@/lib/tradeLenda/profile'
import type { PlanChoice } from '@/lib/tradeLenda/server'

import { saveLeadProfile, setLeadTick } from '@/app/admin/(shell)/waitlist/profiles/actions'

type Initial = {
  customerType: string
  businessName: string
  contactRole: string
  firstName: string
  surname: string
  otherNames: string
  dateOfBirth: string
  email: string
  whatsapp: string
  state: string
  lga: string
  street: string
  landmark: string
  employmentType: string
  employer: string
  jobTitle: string
  incomeRange: string
  guarantorName: string
  guarantorPhone: string
  guarantorRelationship: string
  guarantorAddress: string
  plan: string
  depositPct: number
  months: number
}

type TickView = {
  phoneVerifiedAt: string | null
  phoneVerifiedBy: string | null
  phoneVerifiedNote: string | null
  consentAt: string | null
  consentBy: string | null
  consentNote: string | null
  figuresAgreedAt: string | null
  figuresAgreedBy: string | null
  figuresAgreedNote: string | null
  figuresAgreed: LendingFigures | null
}

const select = 'border-input mt-1 block h-10 w-full rounded-md border bg-white px-2 text-sm'
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Lagos',
      })
    : ''

/** Admin → Waiting list → Edit / Complete profile. */
export function ProfileEditor(props: {
  waitlistId: string
  role: string
  states: NgStateId[]
  initial: Initial
  choices: PlanChoice[]
  completeness: { done: number; total: number; missing: string[] }
  figures: Partial<Record<LendingType, LendingFigures>>
  lendingTypes: LendingType[]
  defaultLendingType: LendingType
  ticks: TickView
  batches: {
    number: string
    version: number
    lendingType: LendingType
    decision: string
    note: string | null
  }[]
}) {
  const { initial: v, completeness: c } = props
  const router = useRouter()
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '')
    const [planKind, planRef] = s('plan').split(':')
    const input = {
      customerType: s('customerType'),
      businessName: s('businessName'),
      contactRole: s('contactRole'),
      firstName: s('firstName'),
      surname: s('surname'),
      otherNames: s('otherNames'),
      dateOfBirth: s('dateOfBirth'),
      email: s('email'),
      whatsapp: s('whatsapp'),
      state: s('state'),
      lga: s('lga'),
      street: s('street'),
      landmark: s('landmark'),
      employmentType: s('employmentType'),
      employer: s('employer'),
      jobTitle: s('jobTitle'),
      incomeRange: s('incomeRange'),
      guarantorName: s('guarantorName'),
      guarantorPhone: s('guarantorPhone'),
      guarantorRelationship: s('guarantorRelationship'),
      guarantorAddress: s('guarantorAddress'),
      planKind: planKind ?? '',
      planRef: planRef ?? '',
      attachQuotation: s('attachQuotation'),
      depositPct: s('depositPct') === '' ? null : Number(s('depositPct')),
      months: s('months') === '' ? null : Number(s('months')),
    }
    start(async () => {
      setNotice(null)
      const r = await saveLeadProfile(props.waitlistId, input)
      setNotice(r.ok ? { ok: true, text: 'Profile saved.' } : { ok: false, text: r.error })
      if (r.ok) router.refresh()
    })
  }

  const field = (name: keyof Initial, label: string, type = 'text') => (
    <div>
      <Label htmlFor={`p-${name}`}>{label}</Label>
      <Input
        id={`p-${name}`}
        name={name}
        type={type}
        defaultValue={String(v[name] ?? '')}
        className="mt-1 h-10 bg-white"
      />
    </div>
  )
  const pct = Math.round((c.done / c.total) * 100)

  return (
    <div className="mt-6 space-y-6">
      <section className="bg-brand-mist rounded-xl p-4" data-testid="profile-completeness">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>
            Profile {c.done} of {c.total}
          </span>
          <span>{pct}%</span>
        </div>
        <div
          className="mt-2 h-2 rounded-full bg-white"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile complete"
        >
          <div className="bg-brand-green h-2 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        {c.missing.length > 0 && (
          <p className="mt-2 text-sm text-amber-900" data-testid="profile-missing">
            Missing: {c.missing.join(', ')}
          </p>
        )}
      </section>

      <form onSubmit={save} className="space-y-6" data-testid="profile-form">
        <Section title="Customer type">
          <div>
            <Label htmlFor="p-customerType">Customer type</Label>
            <select
              id="p-customerType"
              name="customerType"
              defaultValue={v.customerType}
              className={select}
            >
              <option value="">Choose</option>
              <option value="individual">Individual</option>
              <option value="business">Business or institution</option>
            </select>
          </div>
          {field('businessName', 'Business name (business only)')}
          {field('contactRole', 'Contact person’s role (business only)')}
        </Section>
        <Section title="Contact details">
          {field('firstName', 'First name')}
          {field('surname', 'Surname')}
          {field('otherNames', 'Other names')}
          {field('email', 'Email', 'email')}
          {field('whatsapp', 'WhatsApp number', 'tel')}
          {field('dateOfBirth', 'Date of birth (optional)', 'date')}
        </Section>
        <Section title="Address">
          <div>
            <Label htmlFor="p-state">State</Label>
            <select id="p-state" name="state" defaultValue={v.state} className={select}>
              <option value="">Choose the state</option>
              {props.states.map((id) => (
                <option key={id} value={id}>
                  {stateLabel(id)}
                </option>
              ))}
            </select>
          </div>
          {field('lga', 'LGA')}
          {field('street', 'Street address')}
          {field('landmark', 'Landmark')}
        </Section>
        <Section title="Work and income (optional)">
          <div>
            <Label htmlFor="p-employmentType">Work</Label>
            <select
              id="p-employmentType"
              name="employmentType"
              defaultValue={v.employmentType}
              className={select}
            >
              <option value="">Choose</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {field('employer', 'Employer or business')}
          {field('jobTitle', 'Job title')}
          <div>
            <Label htmlFor="p-incomeRange">Monthly income</Label>
            <select
              id="p-incomeRange"
              name="incomeRange"
              defaultValue={v.incomeRange}
              className={select}
            >
              <option value="">Choose</option>
              {INCOME_RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </Section>
        <Section title="Guarantor (optional)">
          {field('guarantorName', 'Name')}
          {field('guarantorPhone', 'Phone', 'tel')}
          {field('guarantorRelationship', 'Relationship')}
          {field('guarantorAddress', 'Address')}
        </Section>
        <Section title="The quote">
          <div className="sm:col-span-2">
            <Label htmlFor="p-plan">Plan or system</Label>
            <select id="p-plan" name="plan" defaultValue={v.plan} className={select}>
              <option value="">Choose</option>
              {props.choices.map((c) => (
                <option key={`${c.kind}:${c.ref}`} value={`${c.kind}:${c.ref}`}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="p-attachQuotation">
              Or attach a staff quotation (paste its link or code)
            </Label>
            <Input
              id="p-attachQuotation"
              name="attachQuotation"
              placeholder="https://go4solar.app/q/… or the code"
              className="mt-1 h-10 bg-white"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              No plan yet? Choose a ready-made plan above, or make a quotation in Admin → Quotations
              during the call and paste its link here.
            </p>
          </div>
          <div>
            <Label htmlFor="p-depositPct">Deposit %</Label>
            <Input
              id="p-depositPct"
              name="depositPct"
              type="number"
              min={20}
              max={95}
              defaultValue={v.depositPct}
              className="mt-1 h-10 bg-white"
            />
          </div>
          <div>
            <Label htmlFor="p-months">Months</Label>
            <select id="p-months" name="months" defaultValue={String(v.months)} className={select}>
              {[6, 9, 12].map((m) => (
                <option key={m} value={m}>
                  {m} months
                </option>
              ))}
            </select>
          </div>
        </Section>
        {notice && (
          <p
            role={notice.ok ? 'status' : 'alert'}
            className={`text-sm ${notice.ok ? 'text-brand-green' : 'text-destructive'}`}
          >
            {notice.text}
          </p>
        )}
        <Button type="submit" disabled={pending} data-testid="profile-save">
          {pending ? 'Saving…' : 'Save profile'}
        </Button>
      </form>

      <FiguresAndTicks {...props} />

      {props.batches.length > 0 && (
        <section className="rounded-xl border p-4 text-sm" data-testid="profile-batches">
          <h2 className="text-brand-dark font-semibold">Sent to Trade Lenda</h2>
          <ul className="mt-2 space-y-1">
            {props.batches.map((b) => (
              <li key={`${b.number}-${b.version}`}>
                {b.number}
                {b.version > 1 ? ` v${b.version}` : ''} · {LENDING_TYPE_LABELS[b.lendingType]} ·{' '}
                <strong>{b.decision.replace('_', ' ')}</strong>
                {b.note ? ` — ${b.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border p-4">
      <legend className="text-brand-dark px-1 font-semibold">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

function FiguresTable({ f }: { f: LendingFigures }) {
  const rows: [string, string][] =
    f.lendingType === 'customer'
      ? [
          ['Price paid in full', formatNaira(f.price)],
          [`Deposit (${formatPercent(f.depositShare)})`, formatNaira(f.deposit)],
          ['Financed by Trade Lenda', formatNaira(f.financed)],
          ['Monthly', `${formatNaira(f.monthly)} × ${f.months} months`],
          ['Total repayment', formatNaira(f.totalRepayment)],
        ]
      : [
          ['Customer pays (our terms)', formatNaira(f.customerTotalPayable ?? 0)],
          [`Deposit (${formatPercent(f.depositShare)})`, formatNaira(f.deposit)],
          ['Customer monthly', `${formatNaira(f.customerMonthly ?? 0)} × ${f.months} months`],
          ['Drawn from Trade Lenda', formatNaira(f.financed)],
          ['Go4Solar repays Trade Lenda', formatNaira(f.totalRepayment)],
        ]
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
      {rows.map(([k, val]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-semibold">{val}</dd>
        </div>
      ))}
    </dl>
  )
}

function FiguresAndTicks(props: Parameters<typeof ProfileEditor>[0]) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [type, setType] = useState<LendingType>(
    props.ticks.figuresAgreed?.lendingType ?? props.defaultLendingType,
  )
  const [error, setError] = useState<string | null>(null)
  const t = props.ticks
  const tick = (kind: 'phone' | 'figures', on: boolean, note: string) =>
    start(async () => {
      setError(null)
      const r = await setLeadTick({
        waitlistId: props.waitlistId,
        kind,
        on,
        note: note || null,
        lendingType: kind === 'figures' ? type : undefined,
      })
      if (!r.ok) setError(r.error)
      else router.refresh()
    })
  const current = props.figures[type]
  const agreed = t.figuresAgreed
  const changed =
    agreed &&
    current &&
    agreed.lendingType === type &&
    (agreed.totalRepayment !== current.totalRepayment || agreed.monthly !== current.monthly)

  return (
    <section className="space-y-4 rounded-xl border p-4" data-testid="profile-ticks">
      <h2 className="text-brand-dark font-semibold">Trade Lenda</h2>
      {props.lendingTypes.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Trade Lenda lends to">
          {props.lendingTypes.map((lt) => (
            <Button
              key={lt}
              type="button"
              size="sm"
              variant={type === lt ? 'default' : 'outline'}
              aria-pressed={type === lt}
              onClick={() => setType(lt)}
            >
              {LENDING_TYPE_LABELS[lt]}
            </Button>
          ))}
        </div>
      )}
      <div className="bg-brand-mist rounded-lg p-3" data-testid={`figures-${type}`}>
        {current ? (
          <FiguresTable f={current} />
        ) : (
          <p className="text-sm">
            Choose the plan, deposit and months, and save, to see the figures.
          </p>
        )}
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <TickRow
        id="phone"
        label="Details confirmed by phone"
        at={t.phoneVerifiedAt}
        by={t.phoneVerifiedBy}
        note={t.phoneVerifiedNote}
        pending={pending}
        onChange={(on, note) => tick('phone', on, note)}
      />
      <p className="text-muted-foreground text-xs">
        Consent to share with Trade Lenda (and every other funder) is below, under “Customer agreed
        we may share their details with”.
      </p>
      <TickRow
        id="figures"
        label={`Customer agreed to these figures on the phone (${LENDING_TYPE_LABELS[type].toLowerCase()})`}
        at={agreed && agreed.lendingType === type ? t.figuresAgreedAt : null}
        by={agreed && agreed.lendingType === type ? t.figuresAgreedBy : null}
        note={t.figuresAgreedNote}
        pending={pending || !current}
        onChange={(on, note) => tick('figures', on, note)}
      />
      {changed && (
        <p className="text-sm font-semibold text-amber-900" role="alert">
          The figures changed since the customer agreed: confirm them again on the phone.
        </p>
      )}
    </section>
  )
}

function TickRow(p: {
  id: string
  label: string
  at: string | null
  by: string | null
  note: string | null
  pending: boolean
  onChange: (on: boolean, note: string) => void
}) {
  const [note, setNote] = useState(p.note ?? '')
  return (
    <div className="rounded-lg border p-3 text-sm" data-testid={`tick-${p.id}`}>
      <label className="flex min-h-11 items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={Boolean(p.at)}
          disabled={p.pending}
          onChange={(e) => p.onChange(e.target.checked, note)}
        />
        {p.label}
      </label>
      {p.at && (
        <p className="text-muted-foreground text-xs">
          {p.by ?? 'Staff'}, {when(p.at)}
        </p>
      )}
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        aria-label={`${p.label}: note`}
        className="mt-2 h-9 bg-white"
        maxLength={500}
      />
    </div>
  )
}
