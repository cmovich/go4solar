'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'

import { NairaField, OptionalPercentField, PercentField } from '@/components/admin/NairaField'
import {
  BuilderDetails,
  SpecsBadge,
  SpecsEditor,
  VoltageField,
} from '@/components/admin/pricing/ComponentSpecs'
import { SizingPanel } from '@/components/admin/SizingPanel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { formatNaira, formatPercent } from '@/lib/money'
import { missingSpecs, usableComponents } from '@/lib/components/specs'
import { equipmentFrom } from '@/lib/sizing/equipment'
import { NG_STATE_IDS, stateLabel, type NgStateId } from '@/lib/nigeria/states'
import {
  COMPONENT_CATEGORIES,
  COMPONENT_CATEGORY_LABELS,
  INSTALL_STATES,
  type ComponentDraft,
  type PricingDraft,
} from '@/lib/pricing/adminSchemas'
import { draftFunders, draftToSettings } from '@/lib/pricing/draft'
import { SAMPLE_PACKAGES, buildPreview, type Preview } from '@/lib/pricing/preview'
import {
  ESTIMATE_TENURE,
  financedShare,
  offeredTenures,
  tenureRateProblem,
} from '@/lib/pricing/tenures'
import type { TenureMonths } from '@/lib/pricing/types'
import { PLANS, PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import { SIZE_BANDS } from '@/lib/settings/schemas'
import type { GridInput, Plan } from '@/lib/sizing/types'

import {
  saveComponents,
  saveEnergySizing,
  saveInstallation,
  saveLateFee,
  saveMargins,
  saveRates,
  saveUnitCosts,
} from '@/app/admin/(shell)/pricing/actions'

const PriceCurve = dynamic(() => import('./PriceCurve').then((m) => m.PriceCurve), {
  ssr: false,
  loading: () => <div className="bg-brand-mist h-40 animate-pulse rounded-lg" aria-hidden />,
})

export type PricingSection =
  'components' | 'margins' | 'rates' | 'installation' | 'unit-costs' | 'late-fee' | 'energy'

export const SECTION_TITLES: Record<PricingSection, string> = {
  components: 'Components',
  margins: 'Margins',
  rates: 'Financing rates',
  installation: 'Installation and logistics',
  'unit-costs': 'Unit costs',
  'late-fee': 'Late fee',
  energy: 'Energy & carbon',
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}

const BAND_LABELS = {
  small: 'Small (≤ 3.5 kVA)',
  medium: 'Medium (≤ 7.5 kVA)',
  large: 'Large (> 7.5 kVA)',
}

export function PricingWorkbench({
  section,
  initial,
}: {
  section: PricingSection
  initial: PricingDraft
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<PricingDraft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial])

  function discard() {
    setDraft(initial)
    setError(null)
    setSaved(false)
  }

  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const r =
        section === 'components'
          ? await saveComponents(draft.components)
          : section === 'margins'
            ? await saveMargins(draft.margins)
            : section === 'rates'
              ? await saveRates(draft.rates)
              : section === 'installation'
                ? await saveInstallation(draft.installation)
                : section === 'unit-costs'
                  ? await saveUnitCosts(draft.unitCosts)
                  : section === 'late-fee'
                    ? await saveLateFee(draft.lateFee)
                    : await saveEnergySizing({
                        energy: draft.energy,
                        sizing: draft.sizing,
                        sunHours: draft.sunHours,
                        wiring: draft.wiring,
                      })
      if (r.ok) {
        setSaved(true)
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        {section === 'components' && <ComponentsForm draft={draft} onChange={setDraft} />}
        {section === 'margins' && <MarginsForm draft={draft} onChange={setDraft} />}
        {section === 'rates' && <RatesForm draft={draft} onChange={setDraft} />}
        {section === 'installation' && <InstallationForm draft={draft} onChange={setDraft} />}
        {section === 'unit-costs' && <UnitCostsForm draft={draft} onChange={setDraft} />}
        {section === 'late-fee' && <LateFeeForm draft={draft} onChange={setDraft} />}
        {section === 'energy' && <EnergySizingForm draft={draft} onChange={setDraft} />}

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {saved && !dirty && (
          <p className="text-brand-green mt-4 text-sm font-medium" role="status">
            Saved. New quotes use these values; existing quotes keep their snapshot.
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <Button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            data-testid="pricing-save"
          >
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="outline" onClick={discard} disabled={pending || !dirty}>
            Discard
          </Button>
        </div>
      </section>

      <PricePreview draft={draft} />
    </div>
  )
}

/** Active inverters whose sizing uses assumed values, and which specs to enter (Part B). */
function AssumedInverterSpecs({ components }: { components: PricingDraft['components'] }) {
  const rows = equipmentFrom({
    inverters: components
      .filter((c) => c.active && c.category === 'inverter')
      .map((c) => ({
        sku: c.sku,
        kva: c.size,
        nominalVoltage: c.nominalVoltage ?? null,
        specs: c.specs ?? {},
      })),
    panel: { sku: '', watts: 550, specs: {} },
    batteries: [],
  }).inverters.filter((i) => i.assumed.length > 0 || i.acChargeA === null)
  if (rows.length === 0) return null
  return (
    <div
      className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
      data-testid="assumed-inverter-specs"
    >
      <p className="font-semibold">Inverters sized with assumed specs ({rows.length})</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((i) => (
          <li key={i.sku}>
            <strong>{i.sku}</strong>:{' '}
            {[
              ...i.assumed,
              ...(i.acChargeA === null ? ['grid (AC) charge current (40 A used)'] : []),
            ].join(', ')}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ----------------------------------------------------------------- preview
export function PricePreview({ draft }: { draft: PricingDraft }) {
  const [pkg, setPkg] = useState(SAMPLE_PACKAGES[0]!.id)
  const [plan, setPlan] = useState<Plan>('comfort')
  const [picked, setTenure] = useState<TenureMonths>(ESTIMATE_TENURE)
  const [pct, setPct] = useState(20)
  const [state, setState] = useState<NgStateId>('Lagos')
  const [grid, setGrid] = useState<GridInput>({
    mode: 'D',
    pattern: 'daily',
    dayHours: 0,
    nightHours: 0,
  })
  const debounced = useDebounced(draft, 150)
  // Only switched-on tenures with a full rate can be previewed (as customers would see them).
  const onTenures = offeredTenures(
    Object.fromEntries(
      debounced.rates
        .filter((r) => tenureRateProblem(r, debounced.minDepositShare) === null && r.enabled)
        .map((r) => [r.tenureMonths, 0]),
    ),
  )
  const tenure = onTenures.includes(picked) ? picked : ESTIMATE_TENURE

  const result = useMemo<{ preview: Preview } | { error: string }>(() => {
    try {
      const settings = draftToSettings(debounced)
      const totals = SAMPLE_PACKAGES.find((p) => p.id === pkg)?.totals ?? SAMPLE_PACKAGES[0]!.totals
      return {
        preview: buildPreview({
          settings,
          totals,
          state,
          plan,
          tenureMonths: tenure,
          depositShare: pct / 100,
          funders: draftFunders(debounced),
          unitCosts: debounced.unitCosts,
          grid,
        }),
      }
    } catch (err) {
      return { error: (err as Error).message }
    }
  }, [debounced, pkg, plan, tenure, pct, state, grid])

  return (
    <aside
      className="bg-brand-mist h-fit rounded-2xl p-5 xl:sticky xl:top-4"
      data-testid="price-preview"
    >
      <h2 className="text-brand-dark text-lg font-semibold">Price preview</h2>
      <p className="text-muted-foreground text-xs">
        Uses the draft values on this page, before you save.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <label className="text-xs">
          Package
          <select
            value={pkg}
            onChange={(e) => setPkg(e.target.value)}
            className="border-input mt-1 block h-9 w-full rounded-md border bg-white px-2 text-sm"
          >
            {SAMPLE_PACKAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Plan
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as Plan)}
            className="border-input mt-1 block h-9 w-full rounded-md border bg-white px-2 text-sm"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {PLAN_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <label className="text-xs">
          State
          <select
            value={state}
            onChange={(e) => setState(e.target.value as NgStateId)}
            className="border-input mt-1 block h-9 w-full rounded-md border bg-white px-2 text-sm"
          >
            {NG_STATE_IDS.map((st) => (
              <option key={st} value={st}>
                {stateLabel(st)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Grid
          <select
            value={grid.mode}
            onChange={(e) => setGrid({ ...grid, mode: e.target.value as GridInput['mode'] })}
            className="border-input mt-1 block h-9 w-full rounded-md border bg-white px-2 text-sm"
            aria-label="Grid mode"
          >
            <option value="A">A · charge + bypass</option>
            <option value="B">B · charge only</option>
            <option value="C">C · supply only</option>
            <option value="D">D · no grid</option>
          </select>
        </label>
        {grid.mode !== 'D' && (
          <>
            <label className="text-xs">
              Day grid hours
              <Input
                type="number"
                min={0}
                max={12}
                step={0.5}
                value={grid.dayHours}
                onChange={(e) => setGrid({ ...grid, dayHours: Number(e.target.value) || 0 })}
                className="mt-1 h-9 bg-white"
              />
            </label>
            <label className="text-xs">
              Night grid hours
              <Input
                type="number"
                min={0}
                max={12}
                step={0.5}
                value={grid.nightHours}
                onChange={(e) => setGrid({ ...grid, nightHours: Number(e.target.value) || 0 })}
                className="mt-1 h-9 bg-white"
              />
            </label>
          </>
        )}
      </div>
      <div className="mt-2 flex gap-1" role="group" aria-label="Tenure">
        {onTenures.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTenure(t)}
            aria-pressed={tenure === t}
            className={`h-9 flex-1 rounded-md border text-sm font-semibold ${tenure === t ? 'border-brand-green bg-brand-green text-white' : 'bg-white'}`}
          >
            {t} mo
          </button>
        ))}
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs">
          <span>Deposit</span>
          <span className="font-semibold tabular-nums" data-testid="preview-pct">
            {pct}%
          </span>
        </div>
        <Slider
          className="mt-1"
          min={20}
          max={95}
          step={1}
          value={[pct]}
          onValueChange={(v) => setPct(v[0] ?? 20)}
          aria-label="Deposit share"
        />
      </div>

      {'error' in result ? (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : (
        <PreviewBody
          plan={plan}
          p={result.preview}
          tenure={tenure}
          minNetMarginShare={draft.unitCosts.minNetMarginShare}
        />
      )}
    </aside>
  )
}

function PreviewBody({
  p,
  plan,
  tenure,
  minNetMarginShare,
}: {
  p: Preview
  plan: Plan
  tenure: TenureMonths
  minNetMarginShare: number
}) {
  return (
    <div className="mt-4 space-y-4 text-sm">
      <p className="text-muted-foreground text-xs">
        {p.size.inverterKva} kVA · {p.size.batteryKwh} kWh · {p.size.panelCount} panels · markup{' '}
        {formatPercent(p.markupShare, 1)}
      </p>
      <SizingPanel size={p.size} plan={plan} />
      <table className="w-full text-xs">
        <thead className="text-muted-foreground text-left">
          <tr>
            <th className="py-1">Line</th>
            <th className="py-1 text-right">Cost</th>
            <th className="py-1 text-right">Markup</th>
            <th className="py-1 text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l) => (
            <tr key={l.sku} className="border-t border-black/5">
              <td className="py-1">
                {l.qty} × {l.name}
              </td>
              <td className="py-1 text-right tabular-nums">{formatNaira(l.lineCost)}</td>
              <td className="py-1 text-right tabular-nums">{formatPercent(l.markupShare, 1)}</td>
              <td className="py-1 text-right font-semibold tabular-nums">
                {formatNaira(l.lineTotal)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-black/5">
            <td className="py-1">Installation and logistics</td>
            <td className="py-1 text-right tabular-nums">{formatNaira(p.installCost)}</td>
            <td className="py-1 text-right">0%</td>
            <td className="py-1 text-right font-semibold tabular-nums">
              {formatNaira(p.installCost)}
            </td>
          </tr>
        </tbody>
      </table>
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-white p-3">
        <div>
          <dt className="text-muted-foreground text-xs">Total</dt>
          <dd className="text-brand-dark font-bold tabular-nums" data-testid="preview-total">
            {formatNaira(p.systemPrice)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Upfront</dt>
          <dd className="text-brand-dark font-bold tabular-nums">{formatNaira(p.deposit)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Monthly × {tenure}</dt>
          <dd className="text-brand-dark font-bold tabular-nums" data-testid="preview-monthly">
            {formatNaira(p.monthly)}
          </dd>
        </div>
      </dl>

      <div>
        <p className="text-brand-dark text-xs font-semibold">
          Go4Solar&apos;s side (per active funder)
        </p>
        <table className="mt-1 w-full text-xs">
          <thead className="text-muted-foreground text-left">
            <tr>
              <th className="py-1">Funder</th>
              <th className="py-1 text-right">Interest</th>
              <th className="py-1 text-right">Net profit</th>
              <th className="py-1 text-right">Return</th>
            </tr>
          </thead>
          <tbody>
            {p.funders.map((f) => {
              const share = p.systemPrice > 0 ? f.profit.netProfit / p.systemPrice : 0
              const bad = f.profit.netProfit < 0
              const low = !bad && share < minNetMarginShare
              return (
                <tr key={f.id} className="border-t border-black/5">
                  <td className="py-1">
                    {f.name}{' '}
                    <span className="text-muted-foreground">{formatPercent(f.annualRate)}</span>
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatNaira(f.profit.funderInterest)}
                  </td>
                  <td
                    className={`py-1 text-right font-semibold tabular-nums ${bad ? 'text-red-700' : low ? 'text-amber-700' : 'text-brand-green'}`}
                  >
                    {formatNaira(f.profit.netProfit)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {f.profit.annualReturnOnDrawn === null
                      ? '—'
                      : formatPercent(f.profit.annualReturnOnDrawn, 1)}
                  </td>
                </tr>
              )
            })}
            {p.funders.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted-foreground py-2">
                  No active funders.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="text-muted-foreground mt-1 text-[11px]">
          Red = loss. Amber = below the minimum net margin ({formatPercent(minNetMarginShare)}) →
          needs super admin.
        </p>
      </div>

      <div>
        <p className="text-brand-dark text-xs font-semibold">
          Each payment plan length (best funder that lends that long)
        </p>
        <table className="mt-1 w-full text-xs" data-testid="preview-tenures">
          <thead className="text-muted-foreground text-left">
            <tr>
              <th className="py-1">Length</th>
              <th className="py-1 text-right">Monthly</th>
              <th className="py-1 text-right">Net profit</th>
              <th className="py-1 text-right">Return</th>
            </tr>
          </thead>
          <tbody>
            {p.tenures.map((t) => {
              const profit = t.funder?.profit
              const share = profit && t.systemPrice > 0 ? profit.netProfit / t.systemPrice : 0
              const bad = !profit || profit.netProfit < 0
              const low = !bad && share < minNetMarginShare
              return (
                <tr key={t.tenureMonths} className="border-t border-black/5">
                  <td className="py-1">
                    {t.tenureMonths} mo{' '}
                    <span className="text-muted-foreground">
                      {t.funder ? t.funder.name : 'no funder lends this long'}
                    </span>
                  </td>
                  <td className="py-1 text-right tabular-nums">{formatNaira(t.monthly)}</td>
                  <td
                    className={`py-1 text-right font-semibold tabular-nums ${bad ? 'text-red-700' : low ? 'text-amber-700' : 'text-brand-green'}`}
                  >
                    {profit ? formatNaira(profit.netProfit) : '—'}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {profit?.annualReturnOnDrawn == null
                      ? '—'
                      : formatPercent(profit.annualReturnOnDrawn, 1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div>
        <p className="text-brand-dark text-xs font-semibold">System price vs deposit</p>
        <PriceCurve data={p.curve} />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ forms
type FormProps = { draft: PricingDraft; onChange: (d: PricingDraft) => void }

function SampleBadge({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
      SAMPLE
    </span>
  )
}

function ComponentsForm({ draft, onChange }: FormProps) {
  // A price edit confirms the row (clears SAMPLE); voltage and spec edits do not.
  const update = (i: number, patch: Partial<ComponentDraft>, clearsSample = true) =>
    onChange({
      ...draft,
      components: draft.components.map((c, j) =>
        j === i ? { ...c, ...patch, ...(clearsSample ? { sample: false } : {}) } : c,
      ),
    })
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [onlyMissing, setOnlyMissing] = useState(false)
  const toggle = (i: number) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  const usage = usableComponents(draft.components.map((c, i) => ({ ...c, id: c.id ?? `new-${i}` })))
  const skippedBySku = new Map(usage.skipped.map((s) => [s.sku, s.reason]))
  const missingCount = draft.components.filter((c) => c.active && missingSpecs(c).length > 0).length
  const add = () =>
    onChange({
      ...draft,
      components: [
        ...draft.components,
        {
          sku: '',
          name: '',
          category: 'panels',
          unitCost: 0,
          size: 0,
          source: 'oem',
          active: true,
          sample: false,
          nominalVoltage: null,
          specs: {},
        },
      ],
    })
  const sizeLabel = { panels: 'W', battery: 'kWh', inverter: 'kVA', accessories: 'max kVA' }
  return (
    <div>
      <h2 className="text-brand-dark text-xl font-semibold">
        Components <SampleBadge show={draft.sample.components} />
      </h2>
      <p className="text-muted-foreground text-sm">
        Landed cost per unit. The sizing engine picks by size. Open &ldquo;Specs&rdquo; on a row to
        enter its datasheet values; items with missing specs are not used by quotes once another
        item in the same category has complete specs. Inverters are always used: a missing spec is
        filled with a typical (assumed) value.
      </p>
      <AssumedInverterSpecs components={draft.components} />
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={onlyMissing}
            onCheckedChange={(v) => setOnlyMissing(v === true)}
            aria-label="Show only rows missing specs"
          />
          Show only rows missing specs ({missingCount})
        </label>
        {usage.categoriesWithoutSpecs.length > 0 && (
          <p className="text-xs text-amber-900" data-testid="specs-category-note">
            No{' '}
            {usage.categoriesWithoutSpecs
              .map((c) => COMPONENT_CATEGORY_LABELS[c].toLowerCase())
              .join(', ')}{' '}
            item has complete specs yet, so quotes still use them all until one does.
          </p>
        )}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              {[
                'SKU',
                'Name',
                'Category',
                'Size',
                'Volts',
                'Unit cost',
                'Source',
                'Active',
                'Specs',
                '',
              ].map((h) => (
                <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.components.map((c, i) =>
              onlyMissing && missingSpecs(c).length === 0 ? null : (
                <Fragment key={c.id ?? `new-${i}`}>
                  <tr className={i % 2 ? 'bg-brand-mist/60' : ''} data-testid="component-row">
                    <td className="px-2 py-1">
                      <Input
                        value={c.sku}
                        onChange={(e) => update(i, { sku: e.target.value })}
                        className="h-9 w-28 font-mono text-xs"
                        aria-label="SKU"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={c.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                        className="h-9 min-w-48"
                        aria-label="Name"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={c.category}
                        onChange={(e) =>
                          update(i, { category: e.target.value as ComponentDraft['category'] })
                        }
                        className="border-input h-9 rounded-md border bg-white px-2 text-sm"
                        aria-label="Category"
                      >
                        {COMPONENT_CATEGORIES.map((k) => (
                          <option key={k} value={k}>
                            {COMPONENT_CATEGORY_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={c.size}
                          onChange={(e) => update(i, { size: parseFloat(e.target.value) || 0 })}
                          className="h-9 w-20 text-sm"
                          aria-label="Size"
                        />
                        <span className="text-muted-foreground text-xs">
                          {sizeLabel[c.category]}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <VoltageField
                        value={c.nominalVoltage}
                        onChange={(v) => update(i, { nominalVoltage: v }, false)}
                        label={`Nominal voltage ${c.sku}`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <NairaField
                        value={c.unitCost}
                        onChange={(v) => update(i, { unitCost: v })}
                        className="w-32"
                        aria-label="Unit cost"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={c.source}
                        onChange={(e) =>
                          update(i, { source: e.target.value as ComponentDraft['source'] })
                        }
                        className="border-input h-9 rounded-md border bg-white px-2 text-sm"
                        aria-label="Source"
                      >
                        <option value="oem">OEM</option>
                        <option value="vendor">Vendor</option>
                      </select>
                    </td>
                    <td className="px-2 py-1 text-center">
                      <Checkbox
                        checked={c.active}
                        onCheckedChange={(v) => update(i, { active: v === true })}
                        aria-label="Active"
                      />
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <SpecsBadge
                        category={c.category}
                        nominalVoltage={c.nominalVoltage}
                        specs={c.specs}
                      />{' '}
                      <button
                        type="button"
                        onClick={() => toggle(i)}
                        aria-expanded={open.has(i)}
                        className="text-brand-blue text-xs font-semibold underline"
                      >
                        {open.has(i) ? 'Hide' : c.kind !== undefined ? 'Specs & details' : 'Specs'}
                      </button>
                    </td>
                    <td className="px-2 py-1">
                      <SampleBadge show={c.sample} />
                    </td>
                  </tr>
                  {open.has(i) && (
                    <tr className={i % 2 ? 'bg-brand-mist/60' : ''}>
                      <td colSpan={10} className="px-2 pb-3">
                        <SpecsEditor
                          sku={c.sku}
                          category={c.category}
                          nominalVoltage={c.nominalVoltage}
                          specs={c.specs}
                          skippedReason={skippedBySku.get(c.sku) ?? null}
                          onChange={(specs) => update(i, { specs }, false)}
                        />
                        {c.kind !== undefined && (
                          <BuilderDetails
                            category={c.category}
                            value={c}
                            onChange={(patch) => update(i, patch as Partial<ComponentDraft>, false)}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ),
            )}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" className="mt-3" onClick={add}>
        Add component
      </Button>
    </div>
  )
}

function MarginsForm({ draft, onChange }: FormProps) {
  return (
    <div>
      <h2 className="text-brand-dark text-xl font-semibold">
        Base margin per category <SampleBadge show={draft.sample.margins} />
      </h2>
      <p className="text-muted-foreground text-sm">
        Added to the landed cost before financing. The financing markup is spread on top.
      </p>
      <div className="mt-4 grid max-w-md gap-4">
        {COMPONENT_CATEGORIES.map((k) => (
          <div key={k}>
            <Label htmlFor={`margin-${k}`}>{COMPONENT_CATEGORY_LABELS[k]}</Label>
            <PercentField
              id={`margin-${k}`}
              value={draft.margins[k]}
              onChange={(v) => onChange({ ...draft, margins: { ...draft.margins, [k]: v } })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function RatesForm({ draft, onChange }: FormProps) {
  const update = (t: TenureMonths, patch: Partial<PricingDraft['rates'][number]>) =>
    onChange({
      ...draft,
      rates: draft.rates.map((r) => (r.tenureMonths === t ? { ...r, ...patch } : r)),
    })
  const minDeposit = draft.minDepositShare
  return (
    <div>
      <h2 className="text-brand-dark text-xl font-semibold">
        Payment plan lengths and financing rates <SampleBadge show={draft.sample.rates} />
      </h2>
      <p className="text-muted-foreground text-sm">
        Pricing rate = expected funder rate + Go4Solar spread + default buffer, per year. Customers
        only see lengths that are switched on; 12 months always stays on (estimates use it).
        Customer prices stay the same whichever funder later approves the loan, and existing quotes
        keep their own rates.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full max-w-3xl text-sm">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              {[
                'Length',
                'On',
                'Expected funder rate',
                'Go4Solar spread',
                'Default buffer',
                'Pricing rate (auto)',
                `Financing adds (at ${formatPercent(minDeposit)} deposit)`,
              ].map((h) => (
                <th key={h} className="px-2 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.rates.map((r) => {
              const parts = [r.expectedFunderRate, r.spread, r.defaultBuffer]
              const rate = parts.every((x) => x !== null)
                ? parts.reduce<number>((a, x) => a + (x ?? 0), 0)
                : null
              const f = rate === null ? null : financedShare(rate, r.tenureMonths)
              const adds =
                f === null || f * (1 - minDeposit) >= 1 ? null : 1 / (1 - f * (1 - minDeposit)) - 1
              const problem = tenureRateProblem(r, minDeposit)
              return (
                <Fragment key={r.tenureMonths}>
                  <tr className={`border-b ${r.enabled ? '' : 'text-muted-foreground'}`}>
                    <td className="px-2 py-2 font-semibold">{r.tenureMonths} months</td>
                    <td className="px-2 py-2">
                      <Checkbox
                        checked={r.enabled}
                        disabled={r.tenureMonths === ESTIMATE_TENURE}
                        onCheckedChange={(v) => update(r.tenureMonths, { enabled: v === true })}
                        aria-label={`Offer ${r.tenureMonths} months`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <OptionalPercentField
                        value={r.expectedFunderRate}
                        onChange={(v) => update(r.tenureMonths, { expectedFunderRate: v })}
                        aria-label={`Expected funder rate ${r.tenureMonths} months`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <OptionalPercentField
                        value={r.spread}
                        onChange={(v) => update(r.tenureMonths, { spread: v })}
                        aria-label={`Spread ${r.tenureMonths} months`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <OptionalPercentField
                        value={r.defaultBuffer}
                        onChange={(v) => update(r.tenureMonths, { defaultBuffer: v })}
                        aria-label={`Default buffer ${r.tenureMonths} months`}
                      />
                    </td>
                    <td
                      className="px-2 py-2 font-bold tabular-nums"
                      data-testid={`rate-${r.tenureMonths}`}
                    >
                      {rate === null ? '—' : formatPercent(rate, 1)}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {adds === null ? '—' : `+${formatPercent(adds, 1)}`}
                    </td>
                  </tr>
                  {problem && (
                    <tr>
                      <td colSpan={7} className="px-2 pb-2 text-xs text-red-700" role="alert">
                        {problem}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        &ldquo;Financing adds&rdquo; is how much the price is above cost plus base margins at the
        lowest deposit: a longer plan adds more, because the rate runs for more years.
      </p>
    </div>
  )
}

function InstallationForm({ draft, onChange }: FormProps) {
  const update = (state: string, band: string, amount: number) =>
    onChange({
      ...draft,
      installation: draft.installation.map((r) =>
        r.state === state && r.sizeBand === band ? { ...r, amount } : r,
      ),
    })
  return (
    <div>
      <h2 className="text-brand-dark text-xl font-semibold">
        Installation and logistics <SampleBadge show={draft.sample.installation} />
      </h2>
      <p className="text-muted-foreground text-sm">
        Fixed amount per job size, for each state. Never marked up. &ldquo;Other&rdquo; is used for
        older records saved without a state.
      </p>
      <table className="mt-4 w-full max-w-2xl text-sm">
        <thead className="bg-brand-green text-left text-white">
          <tr>
            <th className="px-2 py-2 font-semibold">State</th>
            {SIZE_BANDS.map((b) => (
              <th key={b} className="px-2 py-2 font-semibold">
                {BAND_LABELS[b]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {INSTALL_STATES.map((state) => (
            <tr key={state} className="border-b">
              <td className="px-2 py-2 font-semibold">
                {state === 'Other' ? 'Other (fallback)' : stateLabel(state)}
              </td>
              {SIZE_BANDS.map((band) => (
                <td key={band} className="px-2 py-2">
                  <NairaField
                    value={
                      draft.installation.find((r) => r.state === state && r.sizeBand === band)
                        ?.amount ?? 0
                    }
                    onChange={(v) => update(state, band, v)}
                    aria-label={`${state} ${band}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UnitCostsForm({ draft, onChange }: FormProps) {
  const u = draft.unitCosts
  const set = (patch: Partial<typeof u>) => onChange({ ...draft, unitCosts: { ...u, ...patch } })
  return (
    <div>
      <h2 className="text-brand-dark text-xl font-semibold">
        Unit costs <SampleBadge show={draft.sample.unitCosts} />
      </h2>
      <p className="text-muted-foreground text-sm">
        Per-loan running costs used in the profit check.
      </p>
      <div className="mt-4 grid max-w-md gap-4">
        <div>
          <Label htmlFor="kyc">KYC and verification per loan (customer + guarantor)</Label>
          <NairaField id="kyc" value={u.kycPerLoan} onChange={(v) => set({ kycPerLoan: v })} />
        </div>
        <div>
          <Label htmlFor="fee">Payment / direct-debit fee per instalment</Label>
          <NairaField
            id="fee"
            value={u.feePerInstalment}
            onChange={(v) => set({ feePerInstalment: v })}
          />
        </div>
        <div>
          <Label htmlFor="loss">Expected loss provision (share of balance)</Label>
          <PercentField
            id="loss"
            value={u.lossProvisionShare}
            onChange={(v) => set({ lossProvisionShare: v })}
          />
        </div>
        <div>
          <Label htmlFor="minmargin">
            Minimum net margin (share of system price) before super admin approval
          </Label>
          <PercentField
            id="minmargin"
            value={u.minNetMarginShare}
            onChange={(v) => set({ minNetMarginShare: v })}
          />
        </div>
      </div>
    </div>
  )
}

function LateFeeForm({ draft, onChange }: FormProps) {
  const l = draft.lateFee
  return (
    <div>
      <h2 className="text-brand-dark text-xl font-semibold">Late fee and remote lock</h2>
      <p className="text-muted-foreground text-sm">
        Written into every agreement: a share of the overdue amount per day, capped.
      </p>
      <div className="mt-4 grid max-w-md gap-4">
        <div>
          <Label htmlFor="daily">Daily rate (% of the overdue amount per day)</Label>
          <PercentField
            id="daily"
            step={0.01}
            value={l.dailyRate}
            onChange={(v) => onChange({ ...draft, lateFee: { ...l, dailyRate: v } })}
          />
        </div>
        <div>
          <Label htmlFor="cap">Cap (% of the overdue amount)</Label>
          <PercentField
            id="cap"
            value={l.capShare}
            onChange={(v) => onChange({ ...draft, lateFee: { ...l, capShare: v } })}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Example: ₦165,017 overdue for 10 days at {formatPercent(l.dailyRate, 2)}/day ={' '}
          {formatNaira(Math.min(165017 * l.dailyRate * 10, 165017 * l.capShare))} (cap{' '}
          {formatNaira(165017 * l.capShare)}).
        </p>
        <div>
          <Label htmlFor="lock-days">Lock the system after (days overdue)</Label>
          <Input
            id="lock-days"
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            step={1}
            value={l.lockAfterDays}
            onChange={(e) =>
              onChange({
                ...draft,
                lateFee: { ...l, lockAfterDays: Math.round(Number(e.target.value) || 0) },
              })
            }
            className="mt-1"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Printed in new agreements and the customer&apos;s plan summary. An approved extension
            pauses the lock. The remote lock itself arrives in Phase 2.
          </p>
        </div>
      </div>
    </div>
  )
}

function EnergySizingForm({ draft, onChange }: FormProps) {
  const e = draft.energy
  const s = draft.sizing
  const setE = (patch: Partial<typeof e>) =>
    onChange({ ...draft, energy: { ...e, ...patch, sample: false } })
  const setS = (patch: Partial<typeof s>) => onChange({ ...draft, sizing: { ...s, ...patch } })
  const num = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0)
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-brand-dark text-xl font-semibold">
          Energy &amp; carbon <SampleBadge show={e.sample} />
          {!e.grid.verified && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
              UNVERIFIED grid factor
            </span>
          )}
        </h2>
        <div className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="petrol">Petrol price per litre</Label>
            <NairaField
              id="petrol"
              value={e.fuelPricePerLitre.petrol}
              onChange={(v) => setE({ fuelPricePerLitre: { ...e.fuelPricePerLitre, petrol: v } })}
            />
          </div>
          <div>
            <Label htmlFor="diesel">Diesel price per litre</Label>
            <NairaField
              id="diesel"
              value={e.fuelPricePerLitre.diesel}
              onChange={(v) => setE({ fuelPricePerLitre: { ...e.fuelPricePerLitre, diesel: v } })}
            />
          </div>
          <div>
            <Label htmlFor="ef-petrol">Petrol emission factor (kg CO₂ per litre)</Label>
            <Input
              id="ef-petrol"
              type="number"
              step="0.01"
              value={e.emissionFactorKgPerLitre.petrol}
              onChange={(ev) =>
                setE({
                  emissionFactorKgPerLitre: {
                    ...e.emissionFactorKgPerLitre,
                    petrol: num(ev.target.value),
                  },
                })
              }
              className="h-10"
            />
          </div>
          <div>
            <Label htmlFor="ef-diesel">Diesel emission factor (kg CO₂ per litre)</Label>
            <Input
              id="ef-diesel"
              type="number"
              step="0.01"
              value={e.emissionFactorKgPerLitre.diesel}
              onChange={(ev) =>
                setE({
                  emissionFactorKgPerLitre: {
                    ...e.emissionFactorKgPerLitre,
                    diesel: num(ev.target.value),
                  },
                })
              }
              className="h-10"
            />
          </div>
          <div>
            <Label htmlFor="tariff">Grid tariff per kWh</Label>
            <NairaField
              id="tariff"
              value={e.grid.tariffPerKwh}
              onChange={(v) => setE({ grid: { ...e.grid, tariffPerKwh: v } })}
            />
          </div>
          <div>
            <Label htmlFor="gridfactor">Grid emission factor (kg CO₂ per kWh)</Label>
            <Input
              id="gridfactor"
              type="number"
              step="0.01"
              value={e.grid.factorKgPerKwh}
              onChange={(ev) => setE({ grid: { ...e.grid, factorKgPerKwh: num(ev.target.value) } })}
              className="h-10"
            />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <Checkbox
            checked={e.grid.verified}
            onCheckedChange={(v) => setE({ grid: { ...e.grid, verified: v === true } })}
          />
          Grid factor verified against a published Nigerian figure (removes the UNVERIFIED flag from
          PDFs)
        </label>
      </div>

      <SizingFields s={s} setS={setS} num={num} />
      <SunHoursTable draft={draft} onChange={onChange} num={num} />
      <WiringFields draft={draft} onChange={onChange} num={num} />
    </div>
  )
}

/** Wire estimate when a customer does not know the lengths (quote questions, Part E). */
function WiringFields({ draft, onChange, num }: FormProps & { num: (v: string) => number }) {
  const w = draft.wiring
  const set = (patch: Partial<typeof w>) => onChange({ ...draft, wiring: { ...w, ...patch } })
  const fields: [string, number, (v: number) => void][] = [
    ['Metres per storey', w.metresPerStorey, (v) => set({ metresPerStorey: v })],
    ['Horizontal allowance (m)', w.horizontalMetres, (v) => set({ horizontalMetres: v })],
    ['DC multiplier (+ and −)', w.dcMultiplier, (v) => set({ dcMultiplier: v })],
    ['Slack (0.15 = 15%)', w.slackShare, (v) => set({ slackShare: v })],
  ]
  return (
    <div>
      <h2 className="text-brand-dark text-xl font-semibold">
        Wire estimate <SampleBadge show={Boolean(w.sample)} />
      </h2>
      <p className="text-muted-foreground text-sm">
        DC = (storeys above the inverter × metres per storey + horizontal) × DC multiplier × (1 +
        slack); AC = horizontal × (1 + slack). Customers see &ldquo;This is an estimate&rdquo;.
      </p>
      <div className="mt-3 grid max-w-3xl gap-4 sm:grid-cols-4">
        {fields.map(([label, value, onSet]) => (
          <div key={label}>
            <Label htmlFor={`w-${label}`}>{label}</Label>
            <Input
              id={`w-${label}`}
              type="number"
              step="any"
              value={value}
              onChange={(ev) => onSet(num(ev.target.value))}
              className="h-10"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Peak sun hours per state. Editing a row clears its SAMPLE flag when saved. */
function SunHoursTable({ draft, onChange, num }: FormProps & { num: (v: string) => number }) {
  if (draft.sunHours.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Sun hours per state appear here once migration 0024 is applied.
      </p>
    )
  }
  const set = (state: string, patch: { annual?: number; rainy?: number }) =>
    onChange({
      ...draft,
      sunHours: draft.sunHours.map((r) => (r.state === state ? { ...r, ...patch } : r)),
    })
  return (
    <div>
      <h2 className="text-brand-dark text-xl font-semibold">
        Sun hours per state <SampleBadge show={draft.sunHours.some((r) => r.sample)} />
      </h2>
      <p className="text-muted-foreground text-sm">
        Peak sun hours a day. Essentials and Comfort use the yearly average; 24-hour plans use the
        rainy season.
      </p>
      <div className="mt-3 max-h-96 overflow-auto rounded-xl border">
        <table className="w-full text-sm" data-testid="sun-hours-table">
          <thead className="bg-brand-green sticky top-0 text-left text-white">
            <tr>
              {['State', 'Yearly average', 'Rainy season', 'Source'].map((h) => (
                <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.sunHours.map((r) => (
              <tr key={r.state} className="border-t">
                <td className="px-2 py-1 whitespace-nowrap">
                  {r.state === 'FCT' ? 'Abuja (FCT)' : r.state} <SampleBadge show={r.sample} />
                </td>
                {(['annual', 'rainy'] as const).map((k) => (
                  <td key={k} className="px-2 py-1">
                    <Input
                      type="number"
                      step="0.01"
                      min={0.5}
                      max={10}
                      value={r[k]}
                      onChange={(e) => set(r.state, { [k]: num(e.target.value) })}
                      className="h-9 w-24 text-sm"
                      aria-label={`${r.state} ${k === 'annual' ? 'yearly average' : 'rainy season'}`}
                    />
                  </td>
                ))}
                <td className="text-muted-foreground px-2 py-1 text-xs">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type SizingDraft = FormProps['draft']['sizing']

/** Part B sizing settings, grouped; every change is saved with the form and audited. */
function SizingFields({
  s,
  setS,
  num,
}: {
  s: SizingDraft
  setS: (patch: Partial<SizingDraft>) => void
  num: (v: string) => number
}) {
  const groups: {
    title: string
    note?: string
    fields: [string, number, (v: number) => void][]
  }[] = [
    {
      title: 'Backup',
      note: 'Night = no sun. 24-hour plans cover the whole night at full load; Comfort covers its hours at full load; Essentials covers its hours for the items marked essential.',
      fields: [
        ['Night hours (24-hour plan)', s.nightHours, (v) => setS({ nightHours: v })],
        [
          'Comfort night hours',
          s.planNightHours.comfort,
          (v) => setS({ planNightHours: { ...s.planNightHours, comfort: v } }),
        ],
        [
          'Essentials night hours',
          s.planNightHours.essential,
          (v) => setS({ planNightHours: { ...s.planNightHours, essential: v } }),
        ],
        [
          'Minimum backup at full load (hours)',
          s.minBackupFullLoadHours,
          (v) => setS({ minBackupFullLoadHours: v }),
        ],
        [
          'No-grid day floor: Essentials (h)',
          s.noGridDayMinHours.essential,
          (v) => setS({ noGridDayMinHours: { ...s.noGridDayMinHours, essential: v } }),
        ],
        [
          'No-grid day floor: Comfort (h)',
          s.noGridDayMinHours.comfort,
          (v) => setS({ noGridDayMinHours: { ...s.noGridDayMinHours, comfort: v } }),
        ],
        [
          'No-grid day floor: 24-hour (h)',
          s.noGridDayMinHours.independence,
          (v) => setS({ noGridDayMinHours: { ...s.noGridDayMinHours, independence: v } }),
        ],
      ],
    },
    {
      title: 'Battery',
      fields: [
        ['Depth of discharge (0.9 = LiFePO4)', s.dod, (v) => setS({ dod: v })],
        ['Inverter efficiency', s.inverterEfficiency, (v) => setS({ inverterEfficiency: v })],
        ['Battery step when no specs (kWh)', s.batteryStepKwh, (v) => setS({ batteryStepKwh: v })],
      ],
    },
    {
      title: 'Panels and inverter',
      fields: [
        ['Panel derate', s.panelDerate, (v) => setS({ panelDerate: v })],
        ['Refill efficiency', s.refillEfficiency, (v) => setS({ refillEfficiency: v })],
        ['Panel watts (fallback)', s.panelWatts, (v) => setS({ panelWatts: v })],
        ['Power factor (inverter ≥ load ÷ this)', s.powerFactor, (v) => setS({ powerFactor: v })],
        ['Voc safety factor', s.vocSafetyFactor, (v) => setS({ vocSafetyFactor: v })],
      ],
    },
    {
      title: 'Grid supply',
      note: 'Night battery need = target − grid bypass (modes A, C) − grid charging (modes A, B).',
      fields: [
        [
          'Grid charge current (A, default and cap)',
          s.grid.acChargeAmps,
          (v) => setS({ grid: { ...s.grid, acChargeAmps: v } }),
        ],
        [
          'Charging voltage factor',
          s.grid.chargeVoltageFactor,
          (v) => setS({ grid: { ...s.grid, chargeVoltageFactor: v } }),
        ],
        [
          'Charge efficiency',
          s.grid.chargeEfficiency,
          (v) => setS({ grid: { ...s.grid, chargeEfficiency: v } }),
        ],
        [
          'Timing factor',
          s.grid.timingFactor,
          (v) => setS({ grid: { ...s.grid, timingFactor: v } }),
        ],
        [
          'Grid confidence (1 = 100%)',
          s.grid.confidence,
          (v) => setS({ grid: { ...s.grid, confidence: v } }),
        ],
        [
          '"Can\'t be certain" night hours',
          s.grid.uncertainNightHours,
          (v) => setS({ grid: { ...s.grid, uncertainNightHours: v } }),
        ],
        ['Night share for older items', s.nightShare, (v) => setS({ nightShare: v })],
      ],
    },
  ]
  return (
    <div>
      <h2 className="text-brand-dark text-xl font-semibold">Sizing settings</h2>
      <p className="text-muted-foreground text-sm">
        Changing these changes the next estimate only; stored estimates keep their snapshot.
      </p>
      {groups.map((g) => (
        <section key={g.title} className="mt-5">
          <h3 className="text-brand-dark font-semibold">{g.title}</h3>
          {g.note && <p className="text-muted-foreground text-xs">{g.note}</p>}
          <div className="mt-2 grid max-w-3xl gap-4 sm:grid-cols-3">
            {g.fields.map(([label, value, set]) => (
              <div key={label}>
                <Label htmlFor={`sz-${label}`}>{label}</Label>
                <Input
                  id={`sz-${label}`}
                  type="number"
                  step="any"
                  value={value}
                  onChange={(ev) => set(num(ev.target.value))}
                  className="h-10"
                />
              </div>
            ))}
          </div>
        </section>
      ))}
      <label className="mt-5 flex items-center gap-2 text-sm">
        <Checkbox
          checked={s.allowRoundDown}
          onCheckedChange={(v) => setS({ allowRoundDown: v === true })}
        />
        Allow the battery to round down to the nearest size (the shortfall is shown on the plan)
      </label>
    </div>
  )
}
