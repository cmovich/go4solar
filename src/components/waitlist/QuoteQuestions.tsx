'use client'

import { Check, Home, Minus, Plus } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Estimate } from '@/lib/quotes/buildEstimate'
import {
  gridHoursProblem,
  gridTimeProblem,
  rackAlert,
  screensFor,
  wireEstimate,
  type ScreenId,
  type SiteAnswers,
  type WiringSettings,
} from '@/lib/wizard/questions'
import type { RoofTypeCard } from '@/lib/wizard/server'

import { saveSiteAnswers } from '@/app/(public)/waitlist/actions'

const primary = 'h-12 w-full text-base font-semibold'

/** A big tappable answer with its plain-English note. */
function Choice({
  selected,
  label,
  note,
  onClick,
  testId,
}: {
  selected: boolean
  label: string
  note?: string
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className={`w-full rounded-xl border-2 p-4 text-left transition-colors ${
        selected
          ? 'border-brand-green bg-brand-mist'
          : 'hover:border-brand-green/60 border-slate-200 bg-white'
      }`}
    >
      <span className="text-brand-dark flex items-center gap-2 font-semibold">
        {selected && <Check className="text-brand-green size-4 shrink-0" aria-hidden />}
        {label}
      </span>
      {note && <span className="text-muted-foreground mt-1 block text-sm">{note}</span>}
    </button>
  )
}

/** − [number] + with 44 px targets; typing works too. */
function Stepper({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 24,
  step = 1,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="size-11 p-0"
          aria-label={`Less ${label.toLowerCase()}`}
          onClick={() => onChange(clamp(value - step))}
        >
          <Minus className="size-4" aria-hidden />
        </Button>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={0.5}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
          className="h-11 w-24 text-center text-base"
        />
        <Button
          type="button"
          variant="outline"
          className="size-11 p-0"
          aria-label={`More ${label.toLowerCase()}`}
          onClick={() => onChange(clamp((Number.isFinite(value) ? value : 0) + step))}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

const TITLES: Record<ScreenId, string> = {
  scope: 'Do you want a complete system financed, or just some items?',
  existing: 'What inverter or battery do you already have?',
  style: 'What power management style should your quotation reflect?',
  grid: 'Do you want Main Grid to charge your system and supply your facility?',
  gridHours: 'How many hours of grid supply do you get in your area?',
  gridTime: 'What time of day do you get grid supply more often?',
  mounting: 'Where should the panels be mounted?',
  roofType: 'What type of roof do you have?',
  rack: 'Do you want a roofing rack?',
  height: 'How tall is the building?',
  wire: 'Do you know the length of wire needed?',
}

/**
 * Part E: the quote questions, one per screen, with a progress bar and Back. Each answer is saved
 * as it is given; grid answers price the plans again.
 */
export function QuoteQuestions({
  leadId,
  initial,
  roofTypes,
  wiring,
  onBack,
  onDone,
}: {
  leadId: string
  initial: SiteAnswers
  roofTypes: RoofTypeCard[]
  wiring: WiringSettings
  onBack: () => void
  onDone: (answers: SiteAnswers, estimate: Estimate | null) => void
}) {
  const [a, setA] = useState<SiteAnswers>(initial)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [pending, start] = useTransition()
  const screens = screensFor(a)
  const screen = screens[Math.min(index, screens.length - 1)]!
  const roof = roofTypes.find((r) => r.id === a.roofTypeId) ?? null

  /** Save these answers, then go to the next screen (recomputed from the new answers). */
  function next(answers: SiteAnswers = a) {
    setError(null)
    start(async () => {
      const r = await saveSiteAnswers({ id: leadId, answers })
      if (!r.ok) return setError(r.error)
      const latest = r.estimate ?? estimate
      if (r.estimate) setEstimate(r.estimate)
      setA(answers)
      const list = screensFor(answers)
      const at = list.indexOf(screen)
      if (at + 1 >= list.length) onDone(answers, latest)
      else {
        setIndex(at + 1)
        window.scrollTo({ top: 0 })
      }
    })
  }
  function back() {
    setError(null)
    if (index === 0) onBack()
    else setIndex(index - 1)
  }

  const g = a.grid
  return (
    <section className="space-y-5" data-testid={`q-${screen}`}>
      <div>
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-brand-green">
            Question {index + 1} of {screens.length}
          </span>
        </div>
        <div className="bg-brand-mist mt-1 h-2 overflow-hidden rounded-full" aria-hidden>
          <div
            className="bg-brand-green h-full transition-all"
            style={{ width: `${((index + 1) / screens.length) * 100}%` }}
          />
        </div>
      </div>
      <h2 className="text-brand-dark text-2xl font-bold tracking-tight">{TITLES[screen]}</h2>

      {screen === 'scope' && (
        <div className="space-y-3">
          <Choice
            selected={a.scope === 'complete'}
            label="A complete system"
            note="Inverter, battery, panels, accessories and installation."
            onClick={() => next({ ...a, scope: 'complete' })}
          />
          <Choice
            selected={a.scope === 'some'}
            label="Just some items"
            note="For example, just a battery, or more panels for the inverter you already have."
            onClick={() => next({ ...a, scope: 'some' })}
          />
        </div>
      )}

      {screen === 'existing' && (
        <ExistingStep
          value={a.existing}
          pending={pending}
          onSave={(existing) => next({ ...a, existing })}
        />
      )}

      {screen === 'style' && (
        <div className="space-y-3">
          <Choice
            selected={a.style === 'independence'}
            label="24-hour off-grid"
            note="Full load 24 hrs, all items on. More expensive."
            onClick={() => next({ ...a, style: 'independence' })}
          />
          <Choice
            selected={a.style === 'comfort'}
            label="Comfort"
            note="Full load, all items on but not 24 hrs. Moderately cost effective."
            onClick={() => next({ ...a, style: 'comfort' })}
          />
          <Choice
            selected={a.style === 'essential'}
            label="Essentials"
            note="Not full load, not 24 hrs, but I can use any item when I want. Best choice for moderate income earners."
            onClick={() => next({ ...a, style: 'essential' })}
          />
        </div>
      )}

      {screen === 'grid' && (
        <div className="space-y-3">
          <Choice
            selected={g?.mode === 'A'}
            label="Yes, let it charge and bypass"
            note="Bypass means it switches automatically to grid when there is grid supply. It saves backup time."
            onClick={() => next({ ...a, grid: { ...g, mode: 'A' } })}
          />
          <Choice
            selected={g?.mode === 'B'}
            label="Yes, charge the battery but don't supply the facility"
            note="Grid only refills your battery; your home keeps running on the battery."
            onClick={() => next({ ...a, grid: { ...g, mode: 'B' } })}
          />
          <Choice
            selected={g?.mode === 'C'}
            label="Supply the facility but don't charge the battery"
            note="Only select this if you have a good reason to. You may forget to switch on the battery breaker and lose out on sunlight charging."
            onClick={() => next({ ...a, grid: { ...g, mode: 'C' } })}
          />
          <Choice
            selected={g?.mode === 'D'}
            label="I do not want Main/Grid supply"
            note="Only select this if you have a good reason to. You may need more panels to power your home and charge your battery at the same time."
            onClick={() => next({ ...a, grid: { mode: 'D' } })}
          />
        </div>
      )}

      {screen === 'gridHours' && g && (
        <GridHoursStep
          value={g}
          pending={pending}
          onError={setError}
          onSave={(grid) => next({ ...a, grid: { ...grid, mode: g.mode } })}
        />
      )}

      {screen === 'gridTime' && g && (
        <GridTimeStep
          total={g.hours ?? 0}
          value={g}
          pending={pending}
          onError={setError}
          onSave={(day, night) => next({ ...a, grid: { ...g, dayHours: day, nightHours: night } })}
        />
      )}

      {screen === 'mounting' && (
        <MountingStep
          value={a}
          pending={pending}
          onSave={(mounting, mountingOther) => next({ ...a, mounting, mountingOther })}
        />
      )}

      {screen === 'roofType' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {roofTypes.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Roof pictures are on their way. Choose &ldquo;Back&rdquo; and pick another mounting,
              or continue and our installer will check your roof.
            </p>
          )}
          {roofTypes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => next({ ...a, roofTypeId: r.id, roofTypeName: r.name })}
              aria-pressed={a.roofTypeId === r.id}
              data-testid="roof-card"
              className={`overflow-hidden rounded-xl border-2 text-left ${
                a.roofTypeId === r.id ? 'border-brand-green' : 'border-slate-200 bg-white'
              }`}
            >
              {r.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin photos, sized by the uploader
                <img
                  src={r.photoUrl}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="bg-brand-mist flex aspect-[4/3] w-full items-center justify-center">
                  <Home className="text-brand-green size-10" aria-hidden />
                </div>
              )}
              <span className="block p-3">
                <span className="text-brand-dark block font-semibold">{r.name}</span>
                {r.description && (
                  <span className="text-muted-foreground block text-sm">{r.description}</span>
                )}
              </span>
            </button>
          ))}
          {roofTypes.length === 0 && (
            <Button type="button" className={primary} disabled={pending} onClick={() => next(a)}>
              Continue
            </Button>
          )}
        </div>
      )}

      {screen === 'rack' && (
        <RackStep
          roof={roof}
          value={a.rack}
          pending={pending}
          onSave={(rack) => next({ ...a, rack })}
        />
      )}

      {screen === 'height' && (
        <HeightStep
          value={a.building}
          pending={pending}
          onSave={(building) => next({ ...a, building })}
        />
      )}

      {screen === 'wire' && (
        <WireStep
          answers={a}
          wiring={wiring}
          pending={pending}
          onError={setError}
          onSave={(wire) => next({ ...a, wire })}
        />
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="button" variant="ghost" onClick={back} disabled={pending}>
        ‹ Back
      </Button>
    </section>
  )
}

function ExistingStep({
  value,
  pending,
  onSave,
}: {
  value: SiteAnswers['existing']
  pending: boolean
  onSave: (v: NonNullable<SiteAnswers['existing']>) => void
}) {
  const [brand, setBrand] = useState(value?.brand ?? '')
  const [kva, setKva] = useState(value?.kva?.toString() ?? '')
  const [volts, setVolts] = useState(value?.batteryV?.toString() ?? '')
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        We check that new items work with what you already have. An advisor finishes this quote with
        you.
      </p>
      <div>
        <Label htmlFor="ex-brand">Brand</Label>
        <Input
          id="ex-brand"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="mt-1 h-11"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ex-kva">Inverter size (kVA)</Label>
          <Input
            id="ex-kva"
            inputMode="decimal"
            value={kva}
            onChange={(e) => setKva(e.target.value)}
            className="mt-1 h-11"
          />
        </div>
        <div>
          <Label htmlFor="ex-volts">Battery voltage</Label>
          <select
            id="ex-volts"
            value={volts}
            onChange={(e) => setVolts(e.target.value)}
            className="border-input mt-1 block h-11 w-full rounded-md border bg-white px-3"
          >
            <option value="">I don&apos;t know</option>
            <option value="12">12 V</option>
            <option value="24">24 V</option>
            <option value="48">48 V</option>
          </select>
        </div>
      </div>
      <Button
        type="button"
        className={primary}
        disabled={pending}
        onClick={() =>
          onSave({
            brand: brand.trim(),
            kva: kva.trim() ? Number(kva) || null : null,
            batteryV: volts ? Number(volts) : null,
          })
        }
      >
        Next
      </Button>
    </div>
  )
}

function GridHoursStep({
  value,
  pending,
  onError,
  onSave,
}: {
  value: NonNullable<SiteAnswers['grid']>
  pending: boolean
  onError: (e: string | null) => void
  onSave: (g: Omit<NonNullable<SiteAnswers['grid']>, 'mode'>) => void
}) {
  const [pattern, setPattern] = useState(value.pattern ?? null)
  const [hours, setHours] = useState(value.hours ?? 6)
  const needsHours = pattern === 'daily' || pattern === 'some_days'
  return (
    <div className="space-y-3">
      <Choice
        selected={pattern === 'daily'}
        label="A number of hours (every day)"
        onClick={() => setPattern('daily')}
      />
      <Choice
        selected={pattern === 'some_days'}
        label="Not every day"
        note="Tell us the hours on the days you get it."
        onClick={() => setPattern('some_days')}
      />
      <Choice
        selected={pattern === 'uncertain'}
        label="Can't be certain"
        note="Select this if grid comes any time without a pattern."
        onClick={() => onSave({ pattern: 'uncertain' })}
      />
      <Choice
        selected={pattern === 'blackout'}
        label="No grid for a while now"
        note="Select this for areas with total blackout: either the transformer is bad or the grid is yet to reach you."
        onClick={() => onSave({ pattern: 'blackout' })}
      />
      {needsHours && (
        <div className="bg-brand-mist space-y-3 rounded-xl p-4">
          <Stepper
            id="grid-hours"
            label={pattern === 'some_days' ? 'Hours on the days you get it' : 'Hours a day'}
            value={hours}
            onChange={setHours}
          />
          <Button
            type="button"
            className={primary}
            disabled={pending}
            onClick={() => {
              const problem = gridHoursProblem(hours)
              if (problem) return onError(problem)
              onSave({ pattern: pattern!, hours })
            }}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

function GridTimeStep({
  total,
  value,
  pending,
  onError,
  onSave,
}: {
  total: number
  value: NonNullable<SiteAnswers['grid']>
  pending: boolean
  onError: (e: string | null) => void
  onSave: (day: number, night: number) => void
}) {
  const [day, setDay] = useState(value.dayHours ?? 0)
  const [night, setNight] = useState(value.nightHours ?? total)
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Of your {total} hours of grid a day, how many come in the day and how many at night (when
        there is no sun)?
      </p>
      <div className="grid grid-cols-2 gap-4">
        <Stepper id="grid-day" label="Day hours" value={day} onChange={setDay} max={12} />
        <Stepper id="grid-night" label="Night hours" value={night} onChange={setNight} max={12} />
      </div>
      <Button
        type="button"
        className={primary}
        disabled={pending}
        onClick={() => {
          const problem = gridTimeProblem(total, day, night)
          if (problem) return onError(problem)
          onSave(day, night)
        }}
      >
        Next
      </Button>
    </div>
  )
}

function MountingStep({
  value,
  pending,
  onSave,
}: {
  value: SiteAnswers
  pending: boolean
  onSave: (m: NonNullable<SiteAnswers['mounting']>, other?: string) => void
}) {
  const [other, setOther] = useState(value.mountingOther ?? '')
  const [showOther, setShowOther] = useState(value.mounting === 'other')
  const providedNote = 'You provide the space and the mounting structure (not charged).'
  return (
    <div className="space-y-3">
      <Choice selected={value.mounting === 'roof'} label="Roof" onClick={() => onSave('roof')} />
      <Choice
        selected={value.mounting === 'ground'}
        label="Ground"
        note={providedNote}
        onClick={() => onSave('ground')}
      />
      <Choice
        selected={value.mounting === 'carpark'}
        label="Car park"
        note={providedNote}
        onClick={() => onSave('carpark')}
      />
      <Choice
        selected={showOther}
        label="Other"
        note={providedNote}
        onClick={() => setShowOther(true)}
      />
      {showOther && (
        <div className="bg-brand-mist space-y-3 rounded-xl p-4">
          <Label htmlFor="mount-other">Where?</Label>
          <Input
            id="mount-other"
            value={other}
            maxLength={120}
            onChange={(e) => setOther(e.target.value)}
            className="h-11 bg-white"
          />
          <Button
            type="button"
            className={primary}
            disabled={pending || other.trim().length < 2}
            onClick={() => onSave('other', other.trim())}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

function RackStep({
  roof,
  value,
  pending,
  onSave,
}: {
  roof: RoofTypeCard | null
  value: SiteAnswers['rack']
  pending: boolean
  onSave: (r: NonNullable<SiteAnswers['rack']>) => void
}) {
  const [wanted, setWanted] = useState<boolean | null>(value?.wanted ?? null)
  const alert = rackAlert(roof ? { name: roof.name, needsRack: roof.needsRack } : null, {
    wanted: wanted ?? true,
  })
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        A rack holds the panels firmly above the roof, at the right angle, and keeps the roof
        watertight.
      </p>
      <Choice selected={wanted === true} label="Yes" onClick={() => setWanted(true)} />
      {wanted === true && (
        <div className="bg-brand-mist space-y-3 rounded-xl p-4">
          <p className="text-sm">
            <strong>Metal</strong> (galvanised steel) is strong and cheaper.{' '}
            <strong>Aluminium</strong> is lighter and never rusts.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              className="h-12"
              disabled={pending}
              onClick={() => onSave({ wanted: true, material: 'metal' })}
            >
              Metal
            </Button>
            <Button
              type="button"
              className="h-12"
              disabled={pending}
              onClick={() => onSave({ wanted: true, material: 'aluminium' })}
            >
              Aluminium
            </Button>
          </div>
        </div>
      )}
      <Choice selected={wanted === false} label="No" onClick={() => setWanted(false)} />
      {wanted === false && (
        <div className="space-y-3">
          {alert && (
            <p
              className="border-brand-orange bg-brand-orange/10 text-brand-dark rounded-xl border-2 p-4 text-sm font-semibold"
              role="alert"
              data-testid="rack-alert"
            >
              {alert}
            </p>
          )}
          <Button
            type="button"
            className={primary}
            disabled={pending}
            onClick={() => onSave({ wanted: false })}
          >
            Continue without a rack
          </Button>
        </div>
      )}
    </div>
  )
}

function HeightStep({
  value,
  pending,
  onSave,
}: {
  value: SiteAnswers['building']
  pending: boolean
  onSave: (b: NonNullable<SiteAnswers['building']>) => void
}) {
  const [unit, setUnit] = useState<'storeys' | 'feet'>(value?.unit ?? 'storeys')
  const [height, setHeight] = useState(value?.height ?? 1)
  const [floor, setFloor] = useState(value?.floor ?? 0)
  const bad = unit === 'storeys' && floor > height
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Measure in">
        {(['storeys', 'feet'] as const).map((u) => (
          <Button
            key={u}
            type="button"
            variant={unit === u ? 'default' : 'outline'}
            className="h-11"
            aria-pressed={unit === u}
            onClick={() => setUnit(u)}
          >
            {u === 'storeys' ? 'Storeys' : 'Feet'}
          </Button>
        ))}
      </div>
      <Stepper
        id="b-height"
        label={unit === 'storeys' ? 'Storeys above the ground floor' : 'Height in feet'}
        value={height}
        onChange={setHeight}
        max={unit === 'storeys' ? 50 : 300}
      />
      <Stepper
        id="b-floor"
        label="Which floor is your inverter/home on? (0 = ground floor)"
        value={floor}
        onChange={(v) => setFloor(Math.round(v))}
        max={50}
      />
      {bad && <p className="text-sm text-red-700">The floor cannot be higher than the building.</p>}
      <Button
        type="button"
        className={primary}
        disabled={pending || bad || !Number.isFinite(height)}
        onClick={() => onSave({ unit, height, floor })}
      >
        Next
      </Button>
    </div>
  )
}

function WireStep({
  answers,
  wiring,
  pending,
  onError,
  onSave,
}: {
  answers: SiteAnswers
  wiring: WiringSettings
  pending: boolean
  onError: (e: string | null) => void
  onSave: (w: NonNullable<SiteAnswers['wire']>) => void
}) {
  const [known, setKnown] = useState<boolean | null>(answers.wire?.known ?? null)
  const [dc, setDc] = useState(answers.wire?.dcMetres?.toString() ?? '')
  const [ac, setAc] = useState(answers.wire?.acMetres?.toString() ?? '')
  const estimate = wireEstimate({ ...answers, wire: { known: false } }, wiring)!
  return (
    <div className="space-y-3">
      <Choice
        selected={known === true}
        label="Yes, I know the lengths"
        onClick={() => setKnown(true)}
      />
      {known === true && (
        <div className="bg-brand-mist grid grid-cols-2 gap-3 rounded-xl p-4">
          <div>
            <Label htmlFor="wire-dc">DC wire (panels → inverter), metres</Label>
            <Input
              id="wire-dc"
              inputMode="numeric"
              value={dc}
              onChange={(e) => setDc(e.target.value)}
              className="mt-1 h-11 bg-white"
            />
          </div>
          <div>
            <Label htmlFor="wire-ac">AC wire (inverter → distribution board), metres</Label>
            <Input
              id="wire-ac"
              inputMode="numeric"
              value={ac}
              onChange={(e) => setAc(e.target.value)}
              className="mt-1 h-11 bg-white"
            />
          </div>
          <Button
            type="button"
            className={`${primary} col-span-2`}
            disabled={pending}
            onClick={() => {
              const d = Number(dc)
              const c = Number(ac)
              if (!(d >= 1 && d <= 1000 && c >= 1 && c <= 1000)) {
                return onError('Enter both lengths in metres (1 to 1,000).')
              }
              onSave({ known: true, dcMetres: d, acMetres: c })
            }}
          >
            Next
          </Button>
        </div>
      )}
      <Choice
        selected={known === false}
        label="No, estimate it for me"
        onClick={() => setKnown(false)}
      />
      {known === false && (
        <div className="bg-brand-mist space-y-3 rounded-xl p-4" data-testid="wire-estimate">
          <p className="text-sm">
            About <strong>{estimate.dcMetres} m</strong> of DC wire and{' '}
            <strong>{estimate.acMetres} m</strong> of AC wire.
          </p>
          <p className="text-sm font-semibold">
            This is an estimate — you may need extra wire, as we haven&apos;t seen your site.
          </p>
          <Button
            type="button"
            className={primary}
            disabled={pending}
            onClick={() => onSave({ known: false, ...estimate })}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
