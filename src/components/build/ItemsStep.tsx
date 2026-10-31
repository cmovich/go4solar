'use client'

import { ChevronDown, HelpCircle, Minus, Plus, Search, Sun, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ACCESSORY_KINDS, KIND_LABELS, type AccessoryKind } from '@/lib/catalogue/autopick'
import type { BuilderItem } from '@/lib/catalogue/server'
import { formatNaira } from '@/lib/money'

/** The bars, in order; accessories hold one choice per kind. */
const BARS = ['inverter', 'battery', 'panels', 'dc_wire', 'ac_wire', 'accessories'] as const
type Bar = (typeof BARS)[number]

const BAR_LABELS: Record<Bar, string> = {
  inverter: 'Inverter',
  battery: 'Batteries',
  panels: 'Panels',
  dc_wire: 'DC wire',
  ac_wire: 'AC wire',
  accessories: 'Accessories',
}

const HELP: Record<Bar | AccessoryKind | 'pack', string> = {
  inverter:
    'The heart of the system: it turns battery and solar power into the power your sockets use. Bigger kVA runs more appliances at once.',
  battery: 'Stores power for the night and for outages. More kWh means longer backup.',
  panels: 'Make power from sunlight and recharge the battery. More panels charge faster.',
  dc_wire: 'Carries power from the panels to the inverter. Priced per metre.',
  ac_wire: 'Carries power from the inverter to your distribution board. Priced per metre.',
  accessories: 'Protection and fittings every safe installation needs.',
  ac_surge: 'Protects your appliances from grid surges.',
  dc_surge: 'Protects the panels and inverter from lightning surges.',
  ac_breaker: 'Cuts the house supply if something goes wrong.',
  dc_breaker: 'Cuts the panel supply for safe maintenance.',
  changeover: 'Switches your home between grid, solar and generator.',
  voltage_regulator: 'Keeps grid voltage steady so it does not harm the inverter.',
  battery_breaker: 'Lets the battery be switched off safely.',
  breaker_box: 'Holds and protects the breakers.',
  trunk_pipe: 'Covers cables along walls (per metre).',
  flex_pipe: 'Bendable cover for cables (per metre).',
  pack: 'Protection, cables and mounting for your system size, in one pack.',
}

const matches = (i: BuilderItem, q: string) => {
  const hay = [i.name, i.size, i.brand ?? '', i.description ?? '', i.voltage ? `${i.voltage}v` : '']
    .join(' ')
    .toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w))
}

function ItemCard({
  item,
  chosenQty,
  showPrices,
  onChoose,
  onDone,
}: {
  item: BuilderItem
  chosenQty: number | null
  showPrices: boolean
  onChoose: (qty: number) => void
  onDone: () => void
}) {
  const [help, setHelp] = useState(false)
  const metre = item.unit === 'metre'
  const chosen = chosenQty !== null
  const qty = chosenQty ?? 0
  const step = metre ? 5 : 1
  return (
    <li
      className={`rounded-xl border-2 bg-white p-3 ${chosen ? 'border-brand-green' : 'border-slate-200'}`}
      data-testid="build-item"
      data-sku={item.sku}
    >
      <div className="flex gap-3">
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin photos
          <img
            src={item.photoUrl}
            alt=""
            className="size-16 shrink-0 rounded-md object-cover"
            loading="lazy"
          />
        ) : (
          <span className="bg-brand-mist flex size-16 shrink-0 items-center justify-center rounded-md">
            <Sun className="text-brand-green size-7" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-brand-dark font-semibold">{item.name}</p>
          <p className="text-muted-foreground text-xs">
            {item.size}
            {item.brand ? ` · ${item.brand}` : ''}
          </p>
          {item.description && (
            <p className="text-muted-foreground mt-0.5 text-xs">{item.description}</p>
          )}
          {showPrices && (
            <p className="text-brand-dark mt-1 text-sm font-semibold tabular-nums">
              {formatNaira(item.price)}
              {metre ? ' per metre' : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setHelp(!help)}
          aria-label={`What is ${item.name}?`}
          aria-expanded={help}
          className="text-brand-blue -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md"
        >
          <HelpCircle className="size-5" aria-hidden />
        </button>
      </div>
      {help && (
        <p className="bg-brand-mist mt-2 rounded-md p-2 text-sm">
          {(item.kind && HELP[item.kind]) || HELP[item.group]}
        </p>
      )}
      {!chosen ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-11 w-full"
          onClick={() => onChoose(metre ? 20 : 1)}
        >
          Choose
        </Button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm">{metre ? 'Length (m)' : 'Quantity'}</span>
          <Button
            type="button"
            variant="outline"
            className="size-11 p-0"
            aria-label={`Fewer ${item.name}`}
            onClick={() => onChoose(Math.max(0, qty - step))}
          >
            <Minus className="size-4" aria-hidden />
          </Button>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={qty}
            onChange={(e) => onChoose(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            className="h-11 w-20 text-center"
            aria-label={`${metre ? 'Metres of' : 'How many'} ${item.name}`}
          />
          <Button
            type="button"
            variant="outline"
            className="size-11 p-0"
            aria-label={`More ${item.name}`}
            onClick={() => onChoose(qty + step)}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
          <Button type="button" className="ml-auto h-11" onClick={onDone}>
            Done
          </Button>
        </div>
      )}
    </li>
  )
}

/**
 * Step 2 of the builder: "Do you know your load?", one search box, then the accordion of bars.
 * Choosing an item and tapping Done closes its bar and opens the next.
 */
export function ItemsStep({
  items,
  chosen,
  showPrices,
  loadKva,
  calculatedKva,
  pending,
  onChoose,
  onKnownLoad,
  onCalculate,
}: {
  items: BuilderItem[]
  chosen: { sku: string; qty: number }[]
  showPrices: boolean
  loadKva: number | null
  /** The calculator's load on this device, if any. */
  calculatedKva: number | null
  pending: boolean
  onChoose: (sku: string, qty: number) => void
  onKnownLoad: (kva: number) => void
  onCalculate: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Bar | null>('inverter')
  const [filters, setFilters] = useState<Partial<Record<Bar, string>>>({})
  const [kvaOpen, setKvaOpen] = useState(false)
  const [kva, setKva] = useState(loadKva?.toString() ?? '')
  const qtyOf = (sku: string) => chosen.find((c) => c.sku === sku)?.qty ?? null
  const inBar = (bar: Bar) => items.filter((i) => i.group === bar)
  const summary = (bar: Bar) => {
    const picks = chosen
      .map((c) => ({ c, i: items.find((x) => x.sku === c.sku) }))
      .filter((x) => x.i?.group === bar)
    if (picks.length === 0) return null
    return picks
      .map(({ c, i }) => `${i!.name} · ${c.qty}${i!.unit === 'metre' ? ' m' : ''}`)
      .join(', ')
  }
  const searchHits = useMemo(
    () => (query.trim() ? items.filter((i) => matches(i, query)) : []),
    [items, query],
  )
  const next = (bar: Bar) => setOpen(BARS[BARS.indexOf(bar) + 1] ?? null)

  const card = (i: BuilderItem, bar: Bar) => (
    <ItemCard
      key={i.sku}
      item={i}
      chosenQty={qtyOf(i.sku)}
      showPrices={showPrices}
      onChoose={(q) => onChoose(i.sku, q)}
      onDone={() => next(bar)}
    />
  )

  return (
    <div className="space-y-5">
      <section className="bg-brand-mist rounded-2xl p-4" data-testid="load-panel">
        <h2 className="text-brand-dark text-lg font-bold">Do you know your load?</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button type="button" className="h-auto min-h-12 py-2" onClick={() => setKvaOpen(true)}>
            I know my load (kVA)
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-12 flex-col bg-white py-2"
            onClick={onCalculate}
          >
            <span>I don&apos;t know my load</span>
            <span className="text-muted-foreground text-xs font-normal">Calculate it first</span>
          </Button>
        </div>
        {calculatedKva && !kvaOpen && (
          <Button
            type="button"
            variant="link"
            className="mt-2 px-0"
            onClick={() => onKnownLoad(calculatedKva)}
            disabled={pending}
          >
            Use my calculated load: {calculatedKva} kVA
          </Button>
        )}
        {kvaOpen && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="load-kva">Your load (kVA)</Label>
              <Input
                id="load-kva"
                inputMode="decimal"
                value={kva}
                onChange={(e) => setKva(e.target.value)}
                className="mt-1 h-11 w-32 bg-white"
              />
            </div>
            <Button
              type="button"
              className="h-11"
              disabled={pending || !(Number(kva) > 0)}
              onClick={() => onKnownLoad(Number(kva))}
            >
              Suggest a system
            </Button>
          </div>
        )}
        <p className="text-muted-foreground mt-3 text-sm">Or pick your items yourself below.</p>
      </section>

      <div className="relative">
        <Search className="text-muted-foreground absolute top-3.5 left-3 size-4" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all items: name, size, volts, brand"
          aria-label="Search all items"
          className="h-11 pl-9"
        />
      </div>

      {query.trim() ? (
        <ul className="space-y-3" data-testid="search-results">
          {searchHits.map((i) => card(i, (i.group as Bar) ?? 'accessories'))}
          {searchHits.length === 0 && (
            <li className="text-muted-foreground text-sm">Nothing matches.</li>
          )}
        </ul>
      ) : (
        <div className="space-y-2">
          {BARS.map((bar) => {
            const list = inBar(bar)
            const isOpen = open === bar
            const filter = filters[bar] ?? ''
            const shown = filter ? list.filter((i) => matches(i, filter)) : list
            const chosenSummary = summary(bar)
            return (
              <section key={bar} className="rounded-xl border bg-white" data-testid={`bar-${bar}`}>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : bar)}
                >
                  <span className="flex-1">
                    <span className="text-brand-dark block font-semibold">{BAR_LABELS[bar]}</span>
                    <span
                      className={`block text-sm ${chosenSummary ? 'text-brand-green' : 'text-muted-foreground'}`}
                    >
                      {chosenSummary ?? (list.length === 0 ? 'None in stock yet' : 'Not chosen')}
                    </span>
                  </span>
                  <ChevronDown
                    className={`size-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                {chosenSummary && !isOpen && (
                  <div className="px-4 pb-3">
                    <button
                      type="button"
                      className="text-muted-foreground inline-flex min-h-11 items-center gap-1 text-sm underline"
                      onClick={() =>
                        chosen
                          .filter((c) => items.find((x) => x.sku === c.sku)?.group === bar)
                          .forEach((c) => onChoose(c.sku, 0))
                      }
                    >
                      <X className="size-4" aria-hidden /> Leave out
                    </button>
                  </div>
                )}
                {isOpen && (
                  <div className="space-y-3 border-t px-3 py-3">
                    {list.length > 3 && (
                      <Input
                        value={filter}
                        onChange={(e) => setFilters({ ...filters, [bar]: e.target.value })}
                        placeholder={`Filter ${BAR_LABELS[bar].toLowerCase()}`}
                        aria-label={`Filter ${BAR_LABELS[bar].toLowerCase()}`}
                        className="h-11"
                      />
                    )}
                    {bar === 'accessories' ? (
                      [...ACCESSORY_KINDS, 'pack' as const].map((kind) => {
                        const ofKind = shown.filter((i) => i.kind === kind)
                        if (ofKind.length === 0) return null
                        return (
                          <div key={kind}>
                            <p className="text-brand-dark mb-2 text-sm font-semibold">
                              {kind === 'pack' ? 'Accessories pack' : KIND_LABELS[kind]}
                            </p>
                            <ul className="space-y-3">{ofKind.map((i) => card(i, bar))}</ul>
                          </div>
                        )
                      })
                    ) : (
                      <ul className="space-y-3">{shown.map((i) => card(i, bar))}</ul>
                    )}
                    {list.length === 0 && (
                      <p className="text-muted-foreground text-sm">Nothing in stock yet.</p>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
