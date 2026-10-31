'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { NairaField } from '@/components/admin/NairaField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AccessoryRule } from '@/lib/catalogue/autopick'
import type { LogisticsRow } from '@/lib/catalogue/extras'
import { stateLabel } from '@/lib/nigeria/states'

import {
  saveAccessoryRules,
  saveBuilderSettings,
  saveLogistics,
  saveRackPrices,
} from '@/app/admin/(shell)/pricing/builder/actions'

type Settings = {
  railsPerPanel: number
  clampPricePerPanel: number
  extraPerStorey: number
  maxDcVoltageDrop: number
}

function Sample({ show }: { show: boolean }) {
  return show ? (
    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
      SAMPLE
    </span>
  ) : null
}

function useSave() {
  const router = useRouter()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setMsg(null)
      const r = await fn()
      setMsg(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: r.error })
      if (r.ok) router.refresh()
    })
  const note = msg && (
    <Alert variant={msg.ok ? 'default' : 'destructive'} className="mt-2" role="status">
      <AlertDescription>{msg.text}</AlertDescription>
    </Alert>
  )
  return { run, pending, note }
}

const RULE_COLS: [keyof AccessoryRule, string][] = [
  ['maxKva', 'Up to kVA'],
  ['dcBreakerA', 'DC breaker A'],
  ['acBreakerA', 'AC breaker A'],
  ['dcSurgeV', 'DC surge V'],
  ['acSurgeKa', 'AC surge kA'],
  ['batteryBreakerA', 'Battery breaker A'],
  ['changeoverA', 'Changeover A'],
  ['regulatorKva', 'Regulator kVA'],
  ['boxWays', 'Box ways'],
  ['trunkPipeMm', 'Trunk mm'],
  ['flexPipeMm', 'Flex mm'],
  ['acWireMm2', 'AC wire mm²'],
  ['dcWireMm2', 'DC wire mm²'],
  ['trunkPipeM', 'Trunk m'],
  ['flexPipeM', 'Flex m'],
]

/** /admin/pricing/builder: delivery, racks, installation extras and the accessory auto-pick rules. */
export function BuilderAdmin(p: {
  logistics: (LogisticsRow & { sample: boolean })[]
  states: string[]
  rackPrices: { metal: number; aluminium: number; sample: boolean }
  settings: Settings & { sample: boolean }
  rules: (AccessoryRule & { sample: boolean })[]
}) {
  const other = p.logistics.find((r) => r.state === 'Other')
  const [logistics, setLogistics] = useState<LogisticsRow[]>(() =>
    ['Other', ...p.states].map(
      (state) =>
        p.logistics.find((r) => r.state === state) ?? {
          state,
          amount: other?.amount ?? 0,
          extraPerPanel: other?.extraPerPanel ?? 0,
          localVendorsAvailable: false,
        },
    ),
  )
  const [racks, setRacks] = useState({
    metal: p.rackPrices.metal,
    aluminium: p.rackPrices.aluminium,
  })
  const [settings, setSettings] = useState<Settings>(p.settings)
  const [rules, setRules] = useState<AccessoryRule[]>(p.rules)
  const L = useSave()
  const R = useSave()
  const S = useSave()
  const U = useSave()
  const setRow = (i: number, patch: Partial<LogisticsRow>) =>
    setLogistics(logistics.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-brand-dark text-xl font-semibold">
          Delivery per state <Sample show={p.logistics.some((r) => r.sample)} />
        </h2>
        <p className="text-muted-foreground text-sm">
          Every quote gets &ldquo;Delivery — Go4Solar logistics (State)&rdquo;, never marked up. A
          state without its own price uses &ldquo;Other&rdquo;. Where local vendors are available
          the customer may arrange delivery instead. While any delivery price is SAMPLE, website
          prices stay hidden.
        </p>
        <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border">
          <table className="w-full text-sm" data-testid="logistics-table">
            <thead className="bg-brand-green sticky top-0 text-left text-white">
              <tr>
                {['State', 'Delivery', 'Extra per panel', 'Local vendors'].map((h) => (
                  <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logistics.map((r, i) => (
                <tr key={r.state} className="border-t">
                  <td className="px-2 py-1 whitespace-nowrap">
                    {r.state === 'Other' ? 'Other (all the rest)' : stateLabel(r.state)}
                  </td>
                  <td className="px-2 py-1">
                    <NairaField
                      value={r.amount}
                      onChange={(v) => setRow(i, { amount: v })}
                      className="w-32"
                      aria-label={`Delivery ${r.state}`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <NairaField
                      value={r.extraPerPanel}
                      onChange={(v) => setRow(i, { extraPerPanel: v })}
                      className="w-28"
                      aria-label={`Extra per panel ${r.state}`}
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <Checkbox
                      checked={r.localVendorsAvailable}
                      onCheckedChange={(v) => setRow(i, { localVendorsAvailable: v === true })}
                      aria-label={`Local vendors in ${r.state}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          type="button"
          className="mt-3"
          disabled={L.pending}
          onClick={() => L.run(() => saveLogistics(logistics))}
        >
          Save delivery prices
        </Button>
        {L.note}
      </section>

      <section>
        <h2 className="text-brand-dark text-xl font-semibold">
          Roof racks <Sample show={p.rackPrices.sample} />
        </h2>
        <p className="text-muted-foreground text-sm">
          Rack = panels × panel length (cm) × price per cm × rails per panel + clamps. Racks are
          equipment, so the markup applies.
        </p>
        <div className="mt-3 grid max-w-md gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rack-metal">Metal, per cm</Label>
            <NairaField
              id="rack-metal"
              value={racks.metal}
              onChange={(v) => setRacks({ ...racks, metal: v })}
            />
          </div>
          <div>
            <Label htmlFor="rack-alu">Aluminium, per cm</Label>
            <NairaField
              id="rack-alu"
              value={racks.aluminium}
              onChange={(v) => setRacks({ ...racks, aluminium: v })}
            />
          </div>
        </div>
        <Button
          type="button"
          className="mt-3"
          disabled={R.pending}
          onClick={() => R.run(() => saveRackPrices(racks))}
        >
          Save rack prices
        </Button>
        {R.note}
      </section>

      <section>
        <h2 className="text-brand-dark text-xl font-semibold">
          Racks, height and wiring <Sample show={p.settings.sample} />
        </h2>
        <div className="mt-3 grid max-w-3xl gap-4 sm:grid-cols-4">
          <div>
            <Label htmlFor="rails">Rails per panel</Label>
            <Input
              id="rails"
              type="number"
              step="any"
              value={settings.railsPerPanel}
              onChange={(e) =>
                setSettings({ ...settings, railsPerPanel: Number(e.target.value) || 0 })
              }
              className="h-10"
            />
          </div>
          <div>
            <Label htmlFor="clamp">Clamps per panel</Label>
            <NairaField
              id="clamp"
              value={settings.clampPricePerPanel}
              onChange={(v) => setSettings({ ...settings, clampPricePerPanel: v })}
            />
          </div>
          <div>
            <Label htmlFor="storey">Installation per storey above ground</Label>
            <NairaField
              id="storey"
              value={settings.extraPerStorey}
              onChange={(v) => setSettings({ ...settings, extraPerStorey: v })}
            />
          </div>
          <div>
            <Label htmlFor="drop">Max DC voltage drop (%)</Label>
            <Input
              id="drop"
              type="number"
              step="0.5"
              value={Math.round(settings.maxDcVoltageDrop * 1000) / 10}
              onChange={(e) =>
                setSettings({ ...settings, maxDcVoltageDrop: (Number(e.target.value) || 3) / 100 })
              }
              className="h-10"
            />
          </div>
        </div>
        <Button
          type="button"
          className="mt-3"
          disabled={S.pending}
          onClick={() => S.run(() => saveBuilderSettings(settings))}
        >
          Save settings
        </Button>
        {S.note}
      </section>

      <section>
        <h2 className="text-brand-dark text-xl font-semibold">
          Accessory auto-pick rules <Sample show={p.rules.some((r) => r.sample)} />
        </h2>
        <p className="text-muted-foreground text-sm">
          For systems up to each kVA: the rating of every accessory and the default pipe lengths.
          Quotes pick the smallest stocked item at or above each rating (active items with their
          type and rating set in Pricing → Components). The DC wire also grows to keep the voltage
          drop under the limit above.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border">
          <table className="text-sm" data-testid="rules-table">
            <thead className="bg-brand-green text-left text-white">
              <tr>
                {RULE_COLS.map(([, h]) => (
                  <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i} className="border-t">
                  {RULE_COLS.map(([k, h]) => (
                    <td key={k} className="px-1 py-1">
                      <Input
                        type="number"
                        step="any"
                        value={r[k]}
                        onChange={(e) =>
                          setRules(
                            rules.map((x, j) =>
                              j === i ? { ...x, [k]: Number(e.target.value) || 0 } : x,
                            ),
                          )
                        }
                        className="h-9 w-20 text-sm"
                        aria-label={`${h} (rule ${i + 1})`}
                      />
                    </td>
                  ))}
                  <td className="px-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setRules(rules.filter((_, j) => j !== i))}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setRules([
                ...rules,
                {
                  ...(rules[rules.length - 1] ?? RULE_DEFAULT),
                  maxKva: (rules[rules.length - 1]?.maxKva ?? 0) + 5,
                },
              ])
            }
          >
            Add rule
          </Button>
          <Button
            type="button"
            disabled={U.pending}
            onClick={() => U.run(() => saveAccessoryRules(rules))}
          >
            Save rules
          </Button>
        </div>
        {U.note}
      </section>
    </div>
  )
}

const RULE_DEFAULT: AccessoryRule = {
  maxKva: 5,
  dcBreakerA: 63,
  acBreakerA: 63,
  dcSurgeV: 1000,
  acSurgeKa: 40,
  batteryBreakerA: 250,
  changeoverA: 63,
  regulatorKva: 5,
  boxWays: 8,
  trunkPipeMm: 25,
  flexPipeMm: 25,
  acWireMm2: 10,
  dcWireMm2: 6,
  trunkPipeM: 12,
  flexPipeM: 6,
}
