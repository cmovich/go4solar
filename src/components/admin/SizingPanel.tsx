import { PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import { backupLines } from '@/lib/sizing/describe'
import type { Plan, SystemSize } from '@/lib/sizing/types'

const GRID_MODE_LABELS = {
  A: 'A · charge + bypass',
  B: 'B · charge only',
  C: 'C · supply only',
  D: 'D · no grid',
} as const

const kwh = (n: number) => `${n} kWh`

/** Admin "How this was sized": every number behind a plan's inverter, battery and panels. */
export function SizingPanel({ size, plan }: { size: SystemSize; plan: Plan }) {
  const w = size.workings
  return (
    <details className="rounded-xl border bg-white p-4 text-sm" data-testid="sizing-panel">
      <summary className="text-brand-dark cursor-pointer font-semibold">
        How this was sized · {PLAN_LABELS[plan]}: {size.inverterKva} kVA · {size.batteryKwh} kWh
        {size.batteryV ? ` (${size.batteryV} V)` : ''} · {size.panelCount} panels
      </summary>
      {!w ? (
        <p className="text-muted-foreground mt-2">
          Sized before the Part B engine (Oct 2026): only the totals were stored.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <Section
            title="Load"
            rows={[
              [
                'Items covered',
                w.items === 'essential' ? 'Essential items only' : 'Every item on the list',
              ],
              ['Plan load (running)', `${w.planLoadW} W`],
              ['Full load (all items)', `${w.fullLoadW} W`],
              ['Start-up surge', `${Math.round(w.surgeW)} W`],
              ['Daytime energy', kwh(w.dayKwh)],
              ['Night energy (typical use)', kwh(w.nightEnergyKwh)],
            ]}
          />
          <Section
            title="Grid"
            rows={
              w.grid
                ? [
                    ['Mode', GRID_MODE_LABELS[w.grid.mode]],
                    ['Day grid hours (counted)', `${w.grid.dayHours} h`],
                    ['Night grid hours (counted)', `${w.grid.nightHours} h`],
                  ]
                : [['Grid', 'None (no grid answers, mode D or blackout)']]
            }
          />
          <Section
            title="Battery"
            rows={[
              ['Night target', `${w.planHours} h × plan load = ${kwh(w.targetKwh)}`],
              ['Grid bypass', `− ${kwh(w.bypassKwh)}`],
              ['Grid charging', `− ${kwh(w.gridChargeKwh)}`],
              ['From the battery', kwh(w.fromBatteryKwh)],
              ['Floor (minimum backup)', kwh(w.floorKwh)],
              ['Needed', kwh(w.needKwh)],
              ['Before rounding (÷ DoD × efficiency)', kwh(w.rawBatteryKwh)],
              [
                'Chosen',
                `${size.batteryKwh} kWh${
                  size.battery?.sku
                    ? ` = ${size.battery.modules} × ${size.battery.sku}`
                    : ` = ${size.battery?.modules ?? '?'} × ${size.battery?.moduleKwh ?? '?'} kWh steps`
                } (usable ${kwh(w.usableKwh)})`,
              ],
            ]}
          />
          <Section
            title="Panels"
            rows={[
              [
                'Sun hours',
                `${w.sunHours} (${w.sunSeason === 'rainy' ? 'rainy season' : 'yearly average'})`,
              ],
              ['Day grid takes off', kwh(w.dayGridKwh)],
              ['Battery refill', kwh(w.refillKwh)],
              ['Solar needed', `${w.kwpNeeded} kWp`],
              ['Panels from energy', String(w.panelsFromEnergy)],
              ['After the midday check', String(w.panelsAfterMidday)],
              [
                'String layout',
                size.stringLayout
                  ? `${size.stringLayout.series} in series × ${size.stringLayout.strings} string${size.stringLayout.strings === 1 ? '' : 's'} = ${size.panelCount}`
                  : '—',
              ],
            ]}
          />
          <div>
            <h3 className="text-brand-dark font-semibold">Inverter</h3>
            <ul className="mt-1 space-y-0.5">
              {w.inverterChecks.map((c) => (
                <li key={c.kva} className={c.ok ? 'text-brand-green' : 'text-muted-foreground'}>
                  {c.kva} kVA: {c.ok ? 'fits' : `no — ${c.reason}`}
                </li>
              ))}
            </ul>
            {size.inverterReason && <p className="mt-1">{size.inverterReason}</p>}
          </div>
          <div>
            <h3 className="text-brand-dark font-semibold">What the customer sees</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {backupLines(size, plan).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          {(w.assumedSpecs.length > 0 || (size.warnings?.length ?? 0) > 0) && (
            <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
              {(size.warnings ?? []).map((x) => (
                <p key={x}>{x}</p>
              ))}
              {w.assumedSpecs.length > 0 && (
                <p>
                  Assumed specs (enter them in Pricing → Components): {w.assumedSpecs.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </details>
  )
}

function Section({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div>
      <h3 className="text-brand-dark font-semibold">{title}</h3>
      <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 sm:max-w-xl">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
