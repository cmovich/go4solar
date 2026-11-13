'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { ImageUpload } from '@/components/admin/content/ImageUpload'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { formatNaira, formatPercent } from '@/lib/money'
import { stateLabel, type NgStateId } from '@/lib/nigeria/states'
import { cardFigures, planPrice, vendorTotal } from '@/lib/readyPlans/price'
import { planProblems } from '@/lib/readyPlans/schema'
import { LINE_KINDS, SYSTEM_VOLTAGES, type ReadyLine, type ReadyPlan } from '@/lib/readyPlans/types'

import {
  confirmReadyPlan,
  moveReadyPlan,
  saveReadyPlan,
  setReadyPlanActive,
} from '@/app/admin/(shell)/pricing/ready-plans/actions'

type AdminPlan = ReadyPlan & { imageUrl: string | null }

const TENURE_CHOICES = [3, 6, 9, 12, 18, 24]
const field = 'border-input mt-1 block h-9 w-full rounded-md border bg-white px-2 text-sm'

const BLANK: AdminPlan = {
  slug: '',
  name: '',
  tagline: null,
  summary: '',
  tag: null,
  systemVoltage: 12,
  inverterKva: 1,
  image: null,
  imageUrl: null,
  lines: [
    { kind: 'battery', name: 'Battery', spec: '', qty: 1, vendorCost: 0, price: 0 },
    { kind: 'installation', name: 'Installation', spec: '', qty: 1, vendorCost: 0, price: 0 },
    { kind: 'logistics', name: 'Delivery (Kaduna)', spec: '', qty: 1, vendorCost: 0, price: 0 },
  ],
  canPower: [],
  backup: [],
  depositShare: 0.2,
  monthlyRate: 0.05,
  tenures: [6, 9, 12],
  fullDiscount: 0,
  deliveryState: 'Kaduna',
  adminNote: null,
  sortOrder: 99,
  active: true,
  sample: true,
}

/** Admin → Pricing → Ready-made plans: list (order, on/off, confirm prices) and the editor. */
export function ReadyPlansAdmin({ plans, states }: { plans: AdminPlan[]; states: NgStateId[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<AdminPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null)
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'Something went wrong.')
      else router.refresh()
    })

  if (editing) {
    return (
      <PlanEditor
        initial={editing}
        states={states}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          router.refresh()
        }}
      />
    )
  }

  return (
    <div className="space-y-4" data-testid="ready-plans-admin">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-brand-dark text-xl font-semibold">Ready-made plans</h2>
          <p className="text-muted-foreground text-sm">
            Fixed bundles on the home page and at /plans/&lt;address&gt;. Priced with their own flat
            monthly rate, not the sizing engine. Customers never see vendor costs, line prices or
            the rate. A new plan stays SAMPLE (no naira shown) until you confirm its prices.
          </p>
        </div>
        <Button type="button" onClick={() => setEditing({ ...BLANK, sortOrder: plans.length + 1 })}>
          Add a plan
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              {['Order', 'Plan', 'Price', 'Vendor cost', 'Deposit / 12 months', 'Status', ''].map(
                (h) => (
                  <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {plans.map((p, i) => {
              const f = p.tenures.includes(12) ? cardFigures(p).card : null
              return (
                <tr
                  key={p.id}
                  className={`border-t ${p.active ? '' : 'opacity-60'}`}
                  data-testid="ready-plan-row"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending || i === 0}
                      aria-label={`Move ${p.name} up`}
                      onClick={() => run(() => moveReadyPlan({ id: p.id, direction: 'up' }))}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending || i === plans.length - 1}
                      aria-label={`Move ${p.name} down`}
                      onClick={() => run(() => moveReadyPlan({ id: p.id, direction: 'down' }))}
                    >
                      ↓
                    </Button>
                  </td>
                  <td className="flex items-start gap-3 px-3 py-2">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        width={64}
                        height={48}
                        className="h-12 w-16 shrink-0 rounded object-cover"
                        data-testid="plan-thumb"
                      />
                    ) : (
                      <span className="bg-brand-mist text-muted-foreground flex h-12 w-16 shrink-0 items-center justify-center rounded text-[10px]">
                        No picture
                      </span>
                    )}
                    <span>
                      <span className="text-brand-dark block font-semibold">{p.name}</span>
                      <span className="text-muted-foreground block text-xs">{p.summary}</span>
                      {p.adminNote && (
                        <span className="block text-xs text-amber-900" data-testid="admin-note">
                          {p.adminNote}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatNaira(planPrice(p))}</td>
                  <td className="px-3 py-2 tabular-nums">{formatNaira(vendorTotal(p))}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {f ? `${formatNaira(f.deposit)} / ${formatNaira(f.monthly)}` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {p.sample && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        SAMPLE
                      </span>
                    )}{' '}
                    {p.active ? 'On' : 'Off'}
                  </td>
                  <td className="space-x-1 px-3 py-2 whitespace-nowrap">
                    <Button type="button" size="sm" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => setReadyPlanActive({ id: p.id, active: !p.active }))}
                    >
                      {p.active ? 'Switch off' : 'Switch on'}
                    </Button>
                    {p.sample && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => confirmReadyPlan({ id: p.id }))}
                      >
                        Confirm prices
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

function PlanEditor({
  initial,
  states,
  onCancel,
  onSaved,
}: {
  initial: AdminPlan
  states: NgStateId[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [p, setP] = useState<AdminPlan>(initial)
  const [canPower, setCanPower] = useState(initial.canPower.join('\n'))
  const [backup, setBackup] = useState(initial.backup.join('\n'))
  const [preview, setPreview] = useState<string | null>(initial.imageUrl)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const set = (patch: Partial<AdminPlan>) => setP((cur) => ({ ...cur, ...patch }))
  const setLine = (i: number, patch: Partial<ReadyLine>) =>
    set({ lines: p.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const draft: AdminPlan = { ...p, canPower: lines(canPower), backup: lines(backup) }
  const problems = planProblems(draft)
  const figures = useMemo(() => {
    try {
      return problems.length === 0 ? cardFigures(draft) : null
    } catch {
      return null
    }
    // Recomputed from the draft on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(draft)])

  const num = (v: string) => (v === '' ? 0 : Number(v))
  return (
    <div className="space-y-6" data-testid="ready-plan-editor">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-brand-dark text-xl font-semibold">
          {initial.id ? `Edit ${initial.name}` : 'New ready-made plan'}
        </h2>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          Name
          <Input value={p.name} onChange={(e) => set({ name: e.target.value })} className="mt-1" />
        </label>
        <label className="text-sm">
          Address (slug): /plans/…
          <Input
            value={p.slug}
            onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
            className="mt-1 font-mono"
          />
        </label>
        <label className="text-sm">
          Tag (optional, e.g. Best seller)
          <Input
            value={p.tag ?? ''}
            onChange={(e) => set({ tag: e.target.value || null })}
            className="mt-1"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Summary line (e.g. 1 kVA · 1.8 kWh lithium-ion · 2 × 350 W · 12 V)
          <Input
            value={p.summary}
            onChange={(e) => set({ summary: e.target.value })}
            className="mt-1"
          />
        </label>
        <label className="text-sm">
          System voltage
          <select
            value={p.systemVoltage}
            onChange={(e) =>
              set({ systemVoltage: Number(e.target.value) as AdminPlan['systemVoltage'] })
            }
            className={field}
          >
            {SYSTEM_VOLTAGES.map((v) => (
              <option key={v} value={v}>
                {v} V
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Tagline (optional)
          <Input
            value={p.tagline ?? ''}
            onChange={(e) => set({ tagline: e.target.value || null })}
            className="mt-1"
          />
        </label>
        <label className="text-sm">
          Inverter size (kVA, for &ldquo;Customise this plan&rdquo;)
          <Input
            type="number"
            step="any"
            value={p.inverterKva}
            onChange={(e) => set({ inverterKva: num(e.target.value) })}
            className="mt-1"
          />
        </label>
      </section>

      <ImageUpload
        kind="plan"
        label={p.image ? 'Picture (saved; choose another to replace)' : 'Picture (optional, 4:3)'}
        previewUrl={preview}
        onUploaded={(path, url) => {
          setPreview(url)
          set({ image: path })
        }}
      />

      <section>
        <h3 className="text-brand-dark font-semibold">What is included</h3>
        <p className="text-muted-foreground text-xs">
          Customers see the name, spec and quantity only. Vendor cost and price are line totals.
          Installation and delivery are lines too (their kind sets them apart).
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr>
                {['Kind', 'Name', 'Spec', 'Qty', 'Vendor cost (₦)', 'Price (₦)', ''].map((h) => (
                  <th key={h} className="px-1 py-1 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l, i) => (
                <tr key={i} data-testid="plan-line">
                  <td className="px-1 py-1">
                    <select
                      value={l.kind}
                      onChange={(e) => setLine(i, { kind: e.target.value as ReadyLine['kind'] })}
                      className="border-input h-9 rounded-md border bg-white px-1 text-sm"
                      aria-label="Kind"
                    >
                      {LINE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={l.name}
                      onChange={(e) => setLine(i, { name: e.target.value })}
                      className="h-9 min-w-32"
                      aria-label="Name"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={l.spec}
                      onChange={(e) => setLine(i, { spec: e.target.value })}
                      className="h-9 min-w-40"
                      aria-label="Spec"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => setLine(i, { qty: num(e.target.value) })}
                      className="h-9 w-16"
                      aria-label="Qty"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={0}
                      value={l.vendorCost}
                      onChange={(e) => setLine(i, { vendorCost: num(e.target.value) })}
                      className="h-9 w-28"
                      aria-label="Vendor cost"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={0}
                      value={l.price}
                      onChange={(e) => setLine(i, { price: num(e.target.value) })}
                      className="h-9 w-28"
                      aria-label="Price"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${l.name}`}
                      onClick={() => set({ lines: p.lines.filter((_, j) => j !== i) })}
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() =>
            set({
              lines: [
                ...p.lines,
                { kind: 'accessories', name: '', spec: '', qty: 1, vendorCost: 0, price: 0 },
              ],
            })
          }
        >
          Add a line
        </Button>
        <p className="mt-2 text-sm tabular-nums">
          Price {formatNaira(planPrice(draft))} · vendor cost {formatNaira(vendorTotal(draft))}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Can power (one per line)
          <textarea
            value={canPower}
            onChange={(e) => setCanPower(e.target.value)}
            rows={4}
            className="border-input mt-1 block w-full rounded-md border bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Backup estimates (one per line)
          <textarea
            value={backup}
            onChange={(e) => setBackup(e.target.value)}
            rows={4}
            className="border-input mt-1 block w-full rounded-md border bg-white px-2 py-1 text-sm"
          />
        </label>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          Deposit (%)
          <Input
            type="number"
            step="any"
            value={Math.round(p.depositShare * 1000) / 10}
            onChange={(e) => set({ depositShare: num(e.target.value) / 100 })}
            className="mt-1"
          />
        </label>
        <label className="text-sm">
          Monthly rate on the financed amount (%)
          <Input
            type="number"
            step="any"
            value={Math.round(p.monthlyRate * 10000) / 100}
            onChange={(e) => set({ monthlyRate: num(e.target.value) / 100 })}
            className="mt-1"
          />
        </label>
        <label className="text-sm">
          Pay-in-full discount (%, off the 12-month total payable)
          <Input
            type="number"
            step="any"
            value={Math.round(p.fullDiscount * 1000) / 10}
            onChange={(e) => set({ fullDiscount: num(e.target.value) / 100 })}
            className="mt-1"
          />
        </label>
        <label className="text-sm">
          Delivery included to
          <select
            value={p.deliveryState}
            onChange={(e) => set({ deliveryState: e.target.value })}
            className={field}
          >
            {states.map((s) => (
              <option key={s} value={s}>
                {stateLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="text-sm sm:col-span-2">
          <legend>Months offered</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {TENURE_CHOICES.map((t) => (
              <label key={t} className="flex items-center gap-1">
                <Checkbox
                  checked={p.tenures.includes(t)}
                  onCheckedChange={(v) =>
                    set({
                      tenures: (v === true
                        ? [...p.tenures, t]
                        : p.tenures.filter((x) => x !== t)
                      ).sort((a, b) => a - b),
                    })
                  }
                />
                {t}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-sm sm:col-span-2">
          Admin note (staff only)
          <Input
            value={p.adminNote ?? ''}
            onChange={(e) => set({ adminNote: e.target.value || null })}
            className="mt-1"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={p.active} onCheckedChange={(v) => set({ active: v === true })} />
          Shown to customers
        </label>
      </section>

      {figures && (
        <section className="bg-brand-mist rounded-xl p-3 text-sm" data-testid="plan-preview">
          <p className="font-semibold">What customers see (delivery to {draft.deliveryState})</p>
          <ul className="mt-1 space-y-0.5 tabular-nums">
            {figures.tenures.map((t) => (
              <li key={t.months}>
                {t.months} months: deposit {formatNaira(t.deposit)}, then {formatNaira(t.monthly)} a
                month · total payable {formatNaira(t.totalPayable)}
              </li>
            ))}
            <li>
              Pay in full: {formatNaira(figures.fullPayment)} (
              {formatPercent(draft.fullDiscount, 0)} off)
            </li>
          </ul>
        </section>
      )}
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-red-700" role="alert">
          {problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-3">
        <Button
          type="button"
          disabled={pending}
          data-testid="save-plan"
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await saveReadyPlan(draft)
              if (r.ok) onSaved()
              else setError(r.error)
            })
          }
        >
          {pending ? 'Saving…' : 'Save plan'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {draft.sample && (
        <p className="text-muted-foreground text-xs">
          This plan is SAMPLE: customers see it without prices until you press &ldquo;Confirm
          prices&rdquo; on the list.
        </p>
      )}
    </div>
  )
}
