'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { INPUT_FIELDS, getInput, sampleNote, setInput } from '@/lib/forecast/labels'
import { runForecast } from '@/lib/forecast/run'
import {
  perSystem,
  scenarioFromInputs,
  whatIf,
  type ScenarioInputs,
  type ScenarioVariant,
} from '@/lib/forecast/scenario'
import type { ForecastResult } from '@/lib/forecast/types'
import { formatNaira, formatPercent } from '@/lib/money'

import { fromWaitlist, saveForecast } from '@/app/admin/(shell)/forecasts/actions'

const VARIANTS: [ScenarioVariant, string, string][] = [
  ['low', 'Low', '#F47B20'],
  ['base', 'Base', '#2E8B3A'],
  ['high', 'High', '#1B4E9B'],
]
const short = (n: number) => {
  const a = Math.abs(n)
  const s =
    a >= 1e9
      ? `${(a / 1e9).toFixed(1)}bn`
      : a >= 1e6
        ? `${(a / 1e6).toFixed(1)}m`
        : `${Math.round(a / 1e3)}k`
  return `${n < 0 ? '−' : ''}₦${s}`
}
const breakEven = (r: ForecastResult) =>
  r.breakEvenMonth === null
    ? 'Not within the horizon'
    : `Month ${r.breakEvenMonth} (year ${Math.ceil(r.breakEvenMonth / 12)})`

type Summary = {
  signUps: number
  complete: number
  planMix: Record<string, number>
  typeSplit: Record<string, number>
}

export function ForecastWorkbench({
  id,
  name: initialName,
  inputs: initial,
  includeTest,
}: {
  id: string | null
  name: string
  inputs: ScenarioInputs
  includeTest: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [inputs, setInputs] = useState<ScenarioInputs>(initial)
  const [customers, setCustomers] = useState(1000)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const results = useMemo(
    () =>
      VARIANTS.map(([v, label, colour]) => ({
        v,
        label,
        colour,
        r: runForecast(scenarioFromInputs(inputs, v)),
      })),
    [inputs],
  )
  // Sensitivity: the base case against the same scenario with the three sliders at the saved values.
  const reference = useMemo(() => runForecast(scenarioFromInputs(initial, 'base')), [initial])
  const base = results[1]!.r
  const per = perSystem(inputs)
  const w = whatIf(inputs, customers)
  const chart = base.years.map((y, k) => ({
    year: `Y${y.year}`,
    Low: Math.round(results[0]!.r.years[k]!.cumulativeNet),
    Base: Math.round(y.cumulativeNet),
    High: Math.round(results[2]!.r.years[k]!.cumulativeNet),
  }))
  const set = (path: string, value: number) => setInputs((i) => setInput(i, path, value))

  function save(asNew: boolean) {
    setError(null)
    setSaved(null)
    start(async () => {
      const r = await saveForecast({ id: asNew ? undefined : (id ?? undefined), name, inputs })
      if (!r.ok) return setError(r.error)
      setSaved('Saved.')
      router.push(`/admin/forecasts?id=${r.id}${includeTest ? '&test=1' : ''}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="scenario-name">Scenario name</Label>
          <Input
            id="scenario-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-64"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mode">Profit counted</Label>
          <select
            id="mode"
            className="border-input h-9 rounded-md border bg-white px-2 text-sm"
            value={inputs.mode}
            onChange={(e) => setInputs({ ...inputs, mode: e.target.value as 'booked' | 'cash' })}
          >
            <option value="booked">When installed (booked)</option>
            <option value="cash">As customers pay (cash)</option>
          </select>
        </div>
        <Button
          type="button"
          className="bg-brand-green hover:bg-brand-dark"
          disabled={pending}
          onClick={() => save(false)}
        >
          {id ? 'Save' : 'Save scenario'}
        </Button>
        {id && (
          <Button type="button" variant="outline" disabled={pending} onClick={() => save(true)}>
            Save as new
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          data-testid="from-waitlist"
          onClick={() =>
            start(async () => {
              const r = await fromWaitlist(inputs, includeTest)
              if (!r.ok) return setError(r.error)
              setInputs(r.inputs)
              setSummary(r.summary)
            })
          }
        >
          From the waiting list
        </Button>
        {id ? (
          <span className="flex gap-3 text-sm">
            <a
              className="text-brand-blue font-semibold underline"
              href={`/api/admin/forecasts/${id}/pdf`}
            >
              Export PDF
            </a>
            <a
              className="text-brand-blue font-semibold underline"
              href={`/api/admin/forecasts/${id}/xlsx`}
            >
              Export Excel
            </a>
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Save to export PDF / Excel.</span>
        )}
      </section>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && <p className="text-brand-green text-sm font-semibold">{saved}</p>}
      {summary && (
        <p className="bg-brand-mist rounded-lg p-3 text-sm" data-testid="waitlist-summary">
          From {summary.signUps} sign-ups ({summary.complete} complete): plan mix{' '}
          {Object.entries(summary.planMix)
            .map(([k, v]) => `${k} ${formatPercent(v)}`)
            .join(', ') || '—'}
          ; homes / businesses{' '}
          {Object.entries(summary.typeSplit)
            .map(([k, v]) => `${k} ${formatPercent(v)}`)
            .join(', ') || '—'}
          .
        </p>
      )}
      {inputs.sampleInputs.length > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Sample or unverified inputs: {inputs.sampleInputs.join(' · ')}. Exports label them.
        </p>
      )}

      {/* Low / Base / High */}
      <section className="grid gap-4 lg:grid-cols-3" data-testid="variants">
        {results.map(({ v, label, colour, r }) => {
          const last = r.years.at(-1)!
          return (
            <div
              key={v}
              className="rounded-2xl border bg-white p-4"
              style={{ borderTopColor: colour, borderTopWidth: 4 }}
            >
              <h3 className="font-bold" style={{ color: colour }}>
                {label} · growth{' '}
                {formatPercent(
                  v === 'low'
                    ? inputs.growthLow
                    : v === 'high'
                      ? inputs.growthHigh
                      : inputs.growthBase,
                )}
              </h3>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt>Break-even</dt>
                  <dd className="font-semibold" data-testid={`break-even-${v}`}>
                    {breakEven(r)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Year {last.year} net profit</dt>
                  <dd className={`font-semibold ${last.netProfit < 0 ? 'text-red-700' : ''}`}>
                    {formatNaira(Math.round(last.netProfit))}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Cumulative net</dt>
                  <dd className="font-semibold">{formatNaira(Math.round(last.cumulativeNet))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Peak funder money (year {r.peakCapitalYear})</dt>
                  <dd className="font-semibold">
                    {formatNaira(Math.round(r.years[r.peakCapitalYear - 1]!.capitalNeeded))}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>CO₂ avoided, cumulative</dt>
                  <dd className="font-semibold">
                    {Math.round(last.cumulativeCo2Tonnes).toLocaleString('en-US')} t
                  </dd>
                </div>
              </dl>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-xs">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th>Year</th>
                      <th className="text-right">Systems</th>
                      <th className="text-right">Net</th>
                      <th className="text-right">Funder money</th>
                      <th className="text-right">CO₂ t</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.years.map((y) => (
                      <tr key={y.year} className="even:bg-brand-mist">
                        <td>{y.year}</td>
                        <td className="text-right">
                          {Math.round(y.systems).toLocaleString('en-US')}
                        </td>
                        <td className={`text-right ${y.netProfit < 0 ? 'text-red-700' : ''}`}>
                          {short(y.netProfit)}
                        </td>
                        <td className="text-right">{short(y.capitalNeeded)}</td>
                        <td className="text-right">
                          {Math.round(y.co2Tonnes).toLocaleString('en-US')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </section>

      <section className="h-64 rounded-2xl border bg-white p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" fontSize={11} />
            <YAxis tickFormatter={short} fontSize={11} width={64} />
            <Tooltip formatter={(v) => formatNaira(Number(v))} />
            <Legend />
            {VARIANTS.map(([, label, colour]) => (
              <Line
                key={label}
                dataKey={label}
                stroke={colour}
                dot={false}
                name={`${label}: cumulative net`}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Sensitivity */}
      <section className="rounded-2xl border bg-white p-4" data-testid="sensitivity">
        <h2 className="text-brand-dark font-bold">Sensitivity (base case)</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {(
            [
              ['defaultRateExtra', 'Extra default rate', 0, 0.2],
              ['funderAnnualRate', 'Funder rate', 0, 0.4],
              ['nairaDevaluationPerYear', 'Naira devaluation per year', 0, 0.5],
            ] as const
          ).map(([key, label, min, max]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`slider-${key}`}>
                {label}: {formatPercent(inputs[key], 1)}
              </Label>
              <input
                id={`slider-${key}`}
                type="range"
                min={min}
                max={max}
                step={0.005}
                value={inputs[key]}
                onChange={(e) => set(key, Number(e.target.value))}
                className="w-full accent-[#2E8B3A]"
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm">
          Year {base.years.length} net profit{' '}
          {formatNaira(Math.round(base.years.at(-1)!.netProfit))} (
          {signed(base.years.at(-1)!.netProfit - reference.years.at(-1)!.netProfit)} against the
          saved scenario); funder money needed over the horizon{' '}
          {formatNaira(Math.round(base.years.reduce((s, y) => s + y.capitalNeeded, 0)))} (
          {signed(
            base.years.reduce((s, y) => s + y.capitalNeeded, 0) -
              reference.years.reduce((s, y) => s + y.capitalNeeded, 0),
          )}
          ). Devaluation raises costs and, through the markup, prices: naira profit and funder money
          both rise.
        </p>
      </section>

      {/* What if */}
      <section className="rounded-2xl border bg-white p-4" data-testid="what-if">
        <h2 className="text-brand-dark font-bold">What if</h2>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="what-if-customers">Customers per year</Label>
            <Input
              id="what-if-customers"
              type="number"
              min={0}
              value={customers}
              onChange={(e) => setCustomers(Number(e.target.value))}
              className="w-40"
            />
          </div>
          <dl className="grid flex-1 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Net profit</dt>
              <dd
                className={`font-bold ${w.netProfit < 0 ? 'text-red-700' : ''}`}
                data-testid="what-if-net"
              >
                {formatNaira(w.netProfit)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Funder money needed</dt>
              <dd className="font-bold">{formatNaira(w.capitalNeeded)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">CO₂ avoided a year</dt>
              <dd className="font-bold">
                {Math.round(w.co2Tonnes).toLocaleString('en-US')} tonnes
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Staff needed ({inputs.customersPerStaff} customers each)
              </dt>
              <dd className="font-bold">{w.staffNeeded}</dd>
            </div>
          </dl>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          At today&apos;s prices: {formatNaira(per.netProfit)} net profit and{' '}
          {formatNaira(per.drawn)} funder money per system.
        </p>
      </section>

      {/* Inputs */}
      <section className="rounded-2xl border bg-white p-4">
        <h2 className="text-brand-dark font-bold">Inputs</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INPUT_FIELDS.map((f) => {
            const value = getInput(inputs, f.path)
            const note = sampleNote(f.path, inputs.sampleInputs)
            return (
              <div key={f.path} className="space-y-1">
                <Label htmlFor={`in-${f.path}`} className="text-xs">
                  {f.label} {f.kind === 'percent' && '(%)'}
                  {note && <span className="ml-1 font-bold text-amber-700">SAMPLE</span>}
                </Label>
                <Input
                  id={`in-${f.path}`}
                  type="number"
                  step="any"
                  value={f.kind === 'percent' ? Math.round(value * 10000) / 100 : value}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    set(
                      f.path,
                      f.kind === 'percent'
                        ? n / 100
                        : f.path === 'years'
                          ? Math.min(10, Math.max(1, Math.round(n)))
                          : n,
                    )
                  }}
                />
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function signed(n: number) {
  const r = Math.round(n)
  return r === 0 ? 'no change' : `${r > 0 ? '+' : '−'}${formatNaira(Math.abs(r))}`
}
