'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Calculator } from '@/components/calculator/Calculator'
import {
  Choice,
  ExistingStep,
  HeightStep,
  MountingStep,
  RackStep,
  RoofTypePicker,
  WireStep,
} from '@/components/waitlist/QuoteQuestions'
import type { LaunchMode } from '@/config/site'
import type { LibraryItem } from '@/lib/calculator/store'
import { adviceFacts } from '@/lib/build/advice'
import type { BuildSelectionInput } from '@/lib/build/schema'
import type { PricedBuild } from '@/lib/build/server'
import {
  BUILDER_STORAGE_KEY,
  choiceKey,
  kvaFromItems,
  parseBuilderState,
  sanitiseBuilderState,
  serialiseBuilderState,
  setChoice,
  type BuilderState,
  type BuilderStep,
} from '@/lib/build/store'
import { STORAGE_KEY as CALC_KEY, parseStoredItems } from '@/lib/calculator/store'
import type { BuilderItem } from '@/lib/catalogue/server'
import { OWN_INSTALLER_WARNING } from '@/lib/catalogue/extras'
import { formatNaira } from '@/lib/money'
import { NG_STATE_IDS, stateLabel, type NgStateId } from '@/lib/nigeria/states'
import type { TenureMonths } from '@/lib/pricing/types'
import { THANK_YOU_TEXT } from '@/lib/waitlist/schema'
import type { WiringSettings } from '@/lib/wizard/questions'
import type { RoofTypeCard } from '@/lib/wizard/server'

import {
  adjustPlanFromBuilder,
  adviseBuild,
  priceBuild,
  submitBuild,
  suggestBuildAccessories,
  suggestFromLoad,
} from '@/app/(public)/build/actions'

import { ItemsStep } from './ItemsStep'

const primary = 'h-12 w-full text-base font-semibold'

const FRESH: BuilderState = {
  step: 'start',
  items: [],
  site: {},
  installer: null,
  depositPct: 20,
  tenure: 12,
}

/** The step after this one (site steps skip the roof questions off the roof). */
function nextStep(s: BuilderState): BuilderStep {
  const roof = s.site.mounting === 'roof' || !s.site.mounting
  switch (s.step) {
    case 'start':
      return s.scope === 'some' ? 'existing' : 'items'
    case 'existing':
      return 'items'
    case 'items':
      return 'mounting'
    case 'mounting':
      return roof ? 'roofType' : 'wire'
    case 'roofType':
      return 'rack'
    case 'rack':
      return 'height'
    case 'height':
      return 'wire'
    case 'wire':
      return 'installer'
    default:
      return 'summary'
  }
}
function prevStep(s: BuilderState): BuilderStep | null {
  const roof = s.site.mounting === 'roof' || !s.site.mounting
  switch (s.step) {
    case 'existing':
      return 'start'
    case 'items':
      return s.scope === 'some' ? 'existing' : 'start'
    case 'mounting':
      return 'items'
    case 'roofType':
      return 'mounting'
    case 'rack':
      return 'roofType'
    case 'height':
      return 'rack'
    case 'wire':
      return roof ? 'height' : 'mounting'
    case 'installer':
      return 'wire'
    case 'summary':
      return 'installer'
    default:
      return null
  }
}

const TITLES: Partial<Record<BuilderStep, string>> = {
  start: 'Do you want a complete system financed, or just some items?',
  existing: 'What inverter or battery do you already have?',
  items: 'Choose your items',
  mounting: 'Where should the panels be mounted?',
  roofType: 'What type of roof do you have?',
  rack: 'Do you want a roofing rack?',
  height: 'How tall is the building?',
  wire: 'Do you know the length of wire needed?',
  installer: 'Who will install it?',
  summary: 'Your system and payment plan',
}

/**
 * Part F: the "Get started" builder (/build). Complete system or some items → choose items (or
 * "I know my load") → mounting, roof, rack, height, wire → installer → price, deposit, months,
 * advisor → submit (prelaunch) or apply (live). Progress is kept on this device.
 */
export function Builder({
  items,
  roofTypes,
  wiring,
  launchMode,
  showPrices,
  initial,
  done,
  applyCalculatedLoad = false,
  adjust = null,
  staff = null,
  startLoadKva = null,
}: {
  items: BuilderItem[]
  roofTypes: RoofTypeCard[]
  wiring: WiringSettings
  launchMode: LaunchMode
  /** False while prices are SAMPLE: sizes only, prices confirmed later. */
  showPrices: boolean
  /** "Adjust this quote": the plan's items and answers. */
  initial: Partial<BuilderState> | null
  done: boolean
  /**
   * "Customise this plan" (a ready-made plan): start from this load in kVA, so the builder
   * suggests a system to change from (priced the normal custom way).
   */
  startLoadKva?: number | null
  /** Came back from the calculator with "Back to the builder with this load". */
  applyCalculatedLoad?: boolean
  /**
   * "Adjust this quote" from the plans: change this plan's items only, then "Update my plans"
   * (no questions or details asked again; nothing saved over the visitor's own build).
   */
  adjust?: {
    leadId: string
    plan: 'essential' | 'comfort' | 'independence'
    planLabel: string
  } | null
  /**
   * Staff quotation tool (/admin/quotations/new): the same steps for a customer. The state comes
   * from the customer box above; "I don't know my load" opens the calculator on the same page;
   * the summary ends with "Create quotation" (no customer details asked). Nothing is kept on the
   * device.
   */
  staff?: {
    state: NgStateId | null
    library: LibraryItem[]
    onCreate: (input: {
      selection: BuildSelectionInput
      depositShare: number
      tenure: TenureMonths
    }) => Promise<string | null>
  } | null
}) {
  const router = useRouter()
  const [s, setS] = useState<BuilderState>(FRESH)
  const [ready, setReady] = useState(false)
  const [priced, setPriced] = useState<PricedBuild | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [calcKva, setCalcKva] = useState<number | null>(null)
  // The details typed on the summary are kept while moving back and forth (memory only).
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT)
  const [loadNote, setLoadNote] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showCalculator, setShowCalculator] = useState(false)
  const touched = useRef(new Set<string>())

  const keyOf = useCallback(
    (sku: string) => {
      const i = items.find((x) => x.sku === sku)
      return i ? choiceKey(i) : null
    },
    [items],
  )

  // Load progress (or the plan being adjusted) once.
  useEffect(() => {
    let saved: BuilderState | null = null
    let calc: number | null = null
    // Staff quotations start fresh every time (nothing from this device's own builder).
    if (staff) {
      setReady(true)
      return
    }
    try {
      saved = parseBuilderState(window.localStorage.getItem(BUILDER_STORAGE_KEY))
      calc = kvaFromItems(parseStoredItems(window.localStorage.getItem(CALC_KEY)))
    } catch {
      // Storage blocked: start fresh.
    }
    setCalcKva(calc)
    // Saved progress is checked against today's catalogue (old or broken saves never break the page).
    const known = new Set(items.map((i) => i.sku))
    if (initial) setS(sanitiseBuilderState({ ...FRESH, ...initial, step: 'items' }, known))
    else if (saved) setS(sanitiseBuilderState(saved, known))
    setReady(true)
    // Once, on arrival: the catalogue is fixed for this page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  // Keep progress on this device.
  useEffect(() => {
    if (!ready || adjust || staff) return
    try {
      window.localStorage.setItem(BUILDER_STORAGE_KEY, serialiseBuilderState(s))
    } catch {
      // Storage blocked: progress is not kept.
    }
  }, [s, ready, adjust, staff])

  // Staff: the state chosen in the customer box above.
  const staffState = staff?.state ?? null
  useEffect(() => {
    if (staff) setS((cur) => ({ ...cur, state: staffState ?? undefined }))
    // Only the state matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffState])

  const selection = useMemo(
    () =>
      s.state && s.scope
        ? {
            scope: s.scope,
            existing: s.existing,
            loadKva: s.loadKva ?? null,
            state: s.state,
            items: s.items,
            site: s.site,
            installer: s.installer ?? 'go4solar',
            ownDelivery: s.ownDelivery,
          }
        : null,
    [s],
  )

  // Live price (server-side: cost prices never reach the browser).
  useEffect(() => {
    if (!selection) return
    const t = window.setTimeout(async () => {
      const r = await priceBuild({ selection, depositShare: s.depositPct / 100, tenure: s.tenure })
      if (r.ok) setPriced(r.priced)
    }, 300)
    return () => window.clearTimeout(t)
  }, [selection, s.depositPct, s.tenure])

  const go = (step: BuilderStep) => {
    setError(null)
    setS((cur) => ({ ...cur, step }))
    window.scrollTo({ top: 0 })
  }
  const advance = (patch: Partial<BuilderState> = {}) =>
    setS((cur) => {
      const merged = { ...cur, ...patch }
      // Adjusting a plan: the questions were answered already, so items → summary.
      return { ...merged, step: adjust && merged.step === 'items' ? 'summary' : nextStep(merged) }
    })

  /** Choosing an inverter or panels refreshes the accessories the customer has not changed. */
  function choose(sku: string, qty: number) {
    const key = keyOf(sku)
    if (key?.startsWith('acc:') || key === 'dc_wire' || key === 'ac_wire') touched.current.add(key)
    const nextItems = setChoice(s.items, sku, qty, keyOf)
    setS((cur) => ({ ...cur, items: nextItems }))
    if ((key === 'inverter' || key === 'panels') && selection) {
      start(async () => {
        const r = await suggestBuildAccessories({ ...selection, items: nextItems })
        if (!r.ok) return
        setS((cur) => {
          let list = cur.items
          for (const pick of r.items) {
            const k = keyOf(pick.sku)
            if (k && !touched.current.has(k)) list = setChoice(list, pick.sku, pick.qty, keyOf)
          }
          return { ...cur, items: list }
        })
      })
    }
  }

  function knownLoad(kva: number, sel = selection) {
    if (!sel) return
    setLoadError(null)
    setLoadNote(null)
    // Show the load in the box at once; the suggested items follow from the server.
    setS((cur) => ({ ...cur, loadKva: kva }))
    start(async () => {
      const r = await suggestFromLoad({ kva, selection: sel })
      if (!r.ok) return setLoadError(r.error)
      if (r.items.length === 0) {
        return setLoadError('We could not suggest a system for this load. Pick your items below.')
      }
      touched.current.clear()
      setS((cur) => ({ ...cur, loadKva: kva, items: r.items }))
      setLoadNote(
        `We suggested a system for your ${kva} kVA load: inverter, batteries, panels and accessories below. Change anything you like.`,
      )
    })
  }

  // "Customise this plan": suggest a system for the plan's load once, on arrival.
  const planApplied = useRef(false)
  useEffect(() => {
    if (!startLoadKva || planApplied.current || !ready || !selection) return
    planApplied.current = true
    if (s.items.length === 0) knownLoad(startLoadKva, selection)
    // Runs once, when the plan's state and scope are in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, startLoadKva, selection])

  // "Back to the builder with this load" (/build?load=calculated): apply the calculator's load
  // on arrival, then tidy the address so a reload does not apply it again.
  const autoApplied = useRef(false)
  useEffect(() => {
    if (!applyCalculatedLoad || autoApplied.current || !ready) return
    autoApplied.current = true
    router.replace('/build', { scroll: false })
    if (calcKva !== null && selection) knownLoad(calcKva, selection)
    // Runs once, after the saved progress is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, applyCalculatedLoad])

  if (!ready) return <div className="min-h-[50vh]" aria-busy="true" />

  if (done) {
    return (
      <section
        className="border-brand-green rounded-2xl border-2 p-6 text-center"
        data-testid="build-done"
      >
        <h1 className="text-brand-dark text-xl font-bold">Thank you!</h1>
        <p className="mt-2">{THANK_YOU_TEXT}</p>
      </section>
    )
  }

  const Title = staff ? 'h2' : 'h1'
  const noStateMessage = staff
    ? "Choose the customer's state at the top first."
    : 'Choose your state first.'
  const back = adjust ? (s.step === 'summary' ? 'items' : null) : prevStep(s)
  const plansHref = adjust
    ? launchMode === 'live'
      ? `/plans?estimate=${adjust.leadId}`
      : `/waitlist?resume=${adjust.leadId}&at=plans`
    : null
  const priceBar = priced && s.step !== 'start' && s.step !== 'existing' && (
    <div
      className="bg-brand-dark fixed inset-x-0 bottom-0 z-20 px-4 py-3 text-white shadow-lg sm:sticky sm:rounded-xl"
      data-testid="price-bar"
    >
      {!showPrices || priced.sample ? (
        <p className="text-sm">Your exact price will be confirmed when we contact you.</p>
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm tabular-nums">
          <span>
            Total <strong className="text-base">{formatNaira(priced.systemPrice)}</strong>
          </span>
          <span>Deposit {formatNaira(priced.deposit)}</span>
          <span>
            {formatNaira(priced.monthly)} × {priced.months} months
          </span>
        </p>
      )}
    </div>
  )

  return (
    <div className="space-y-6 pb-24 sm:pb-6">
      {/* In the staff tool the page has its own title ("New quotation"): steps are h2 there. */}
      <Title className="text-brand-dark text-2xl font-bold tracking-tight">{TITLES[s.step]}</Title>

      {priced && priced.blocking.length > 0 && s.step !== 'start' && (
        <Alert variant="destructive" data-testid="build-blocking">
          <AlertDescription>
            <ul className="list-disc pl-4">
              {priced.blocking.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {s.step === 'start' && (
        <div className="space-y-4">
          <div hidden={Boolean(staff)}>
            <Label htmlFor="build-state">Where will it be installed?</Label>
            <select
              id="build-state"
              value={s.state ?? ''}
              onChange={(e) => setS({ ...s, state: (e.target.value || undefined) as NgStateId })}
              className="border-input mt-1 block h-12 w-full rounded-md border bg-white px-3 text-base"
            >
              <option value="">Choose your state</option>
              {NG_STATE_IDS.map((id) => (
                <option key={id} value={id}>
                  {stateLabel(id)}
                </option>
              ))}
            </select>
          </div>
          <Choice
            selected={s.scope === 'complete'}
            label="A complete system"
            note="Inverter, battery, panels, accessories and installation."
            onClick={() => (s.state ? advance({ scope: 'complete' }) : setError(noStateMessage))}
          />
          <Choice
            selected={s.scope === 'some'}
            label="Just some items"
            note="For example, just a battery, or more panels for the inverter you already have."
            onClick={() => (s.state ? advance({ scope: 'some' }) : setError(noStateMessage))}
          />
        </div>
      )}

      {s.step === 'existing' && (
        <ExistingStep
          value={s.existing}
          pending={pending}
          onSave={(existing) => advance({ existing })}
        />
      )}

      {s.step === 'items' && (
        <>
          <ItemsStep
            items={items}
            chosen={s.items}
            showPrices={showPrices && !priced?.sample}
            loadKva={s.loadKva ?? null}
            calculatedKva={staff ? null : calcKva}
            pending={pending}
            loadNote={loadNote}
            loadError={loadError}
            onChoose={choose}
            onKnownLoad={knownLoad}
            onCalculate={() =>
              staff ? setShowCalculator(true) : router.push('/calculate?from=build')
            }
          />
          {staff && showCalculator && (
            <section className="rounded-2xl border p-3" data-testid="staff-calculator">
              <div className="flex items-center justify-between">
                <h2 className="text-brand-dark font-semibold">Load calculator</h2>
                <Button type="button" variant="ghost" onClick={() => setShowCalculator(false)}>
                  Close
                </Button>
              </div>
              <Calculator
                library={staff.library}
                launchMode={launchMode}
                photoLookup={false}
                builderLink={false}
                continueLabel="Use this load"
                onContinue={(list) => {
                  const kva = kvaFromItems(list)
                  setShowCalculator(false)
                  if (kva !== null) knownLoad(kva)
                  window.scrollTo({ top: 0 })
                }}
              />
            </section>
          )}
          {priced && priced.warnings.length > 0 && (
            <ul className="text-sm text-amber-900">
              {priced.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            className={primary}
            disabled={pending || s.items.length === 0 || (priced?.blocking.length ?? 0) > 0}
            onClick={() => advance()}
          >
            Next
          </Button>
        </>
      )}

      {s.step === 'mounting' && (
        <MountingStep
          value={s.site}
          pending={false}
          onSave={(mounting, mountingOther) =>
            advance({ site: { ...s.site, mounting, mountingOther } })
          }
        />
      )}
      {s.step === 'roofType' && (
        <RoofTypePicker
          roofTypes={roofTypes}
          selected={s.site.roofTypeId}
          pending={false}
          onPick={(r) =>
            advance(r ? { site: { ...s.site, roofTypeId: r.id, roofTypeName: r.name } } : {})
          }
        />
      )}
      {s.step === 'rack' && (
        <RackStep
          roof={roofTypes.find((r) => r.id === s.site.roofTypeId) ?? null}
          value={s.site.rack}
          pending={false}
          onSave={(rack) => advance({ site: { ...s.site, rack } })}
        />
      )}
      {s.step === 'height' && (
        <HeightStep
          value={s.site.building}
          pending={false}
          onSave={(building) => advance({ site: { ...s.site, building } })}
        />
      )}
      {s.step === 'wire' && (
        <WireStep
          answers={s.site}
          wiring={wiring}
          pending={false}
          onError={setError}
          onSave={(wire) => advance({ site: { ...s.site, wire } })}
        />
      )}

      {s.step === 'installer' && (
        <div className="space-y-3">
          <Choice
            selected={s.installer === 'go4solar'}
            label="Go4Solar recognised installer"
            note={
              showPrices && priced && !priced.sample
                ? `Installation: ${formatNaira(priced.noMarkup.find((l) => l.label === 'Installation')?.amount ?? 0)} (set by your roof, height and state).`
                : 'A vetted installer near you; installation is priced by your roof, height and state.'
            }
            onClick={() => setS({ ...s, installer: 'go4solar' })}
          />
          <Choice
            selected={s.installer === 'own'}
            label="My own installer"
            note={OWN_INSTALLER_WARNING}
            onClick={() => setS({ ...s, installer: 'own' })}
          />
          {s.installer === 'own' && (
            <p
              className="border-brand-orange bg-brand-orange/10 text-brand-dark rounded-xl border-2 p-3 text-sm font-semibold"
              role="alert"
            >
              {OWN_INSTALLER_WARNING}
            </p>
          )}
          {priced?.deliveryRemovable && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <Checkbox
                checked={Boolean(s.ownDelivery)}
                onCheckedChange={(v) => setS({ ...s, ownDelivery: v === true })}
              />
              I will arrange delivery with a local vendor
            </label>
          )}
          <Button
            type="button"
            className={primary}
            disabled={!s.installer}
            onClick={() => go('summary')}
          >
            See my price
          </Button>
        </div>
      )}

      {s.step === 'summary' && priced && selection && (
        <Summary
          priced={priced}
          state={s}
          items={items}
          showPrices={showPrices}
          launchMode={launchMode}
          contact={contact}
          onContact={setContact}
          adjustLabel={adjust?.planLabel ?? null}
          onAdjust={
            adjust
              ? () =>
                  new Promise<string | null>((resolve) =>
                    start(async () => {
                      const r = await adjustPlanFromBuilder({
                        leadId: adjust.leadId,
                        plan: adjust.plan,
                        selection,
                      })
                      if (!r.ok) return resolve(r.error)
                      router.push(r.next)
                      resolve(null)
                    }),
                  )
              : null
          }
          onCreate={
            staff
              ? () =>
                  new Promise<string | null>((resolve) =>
                    start(async () => {
                      resolve(
                        await staff.onCreate({
                          selection,
                          depositShare: s.depositPct / 100,
                          tenure: s.tenure,
                        }),
                      )
                    }),
                  )
              : null
          }
          onDeposit={(pct) => setS({ ...s, depositPct: pct })}
          onTenure={(t) => setS({ ...s, tenure: t })}
          onSubmit={(contact) =>
            new Promise<string | null>((resolve) =>
              start(async () => {
                const r = await submitBuild({
                  selection,
                  depositShare: s.depositPct / 100,
                  tenure: s.tenure,
                  contact,
                })
                if (!r.ok) return resolve(r.error)
                try {
                  window.localStorage.removeItem(BUILDER_STORAGE_KEY)
                } catch {
                  // ignore
                }
                router.push(r.next)
                resolve(null)
              }),
            )
          }
        />
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {plansHref && s.step === 'items' && (
        <Button asChild variant="ghost">
          <Link href={plansHref} data-testid="back-to-plans">
            ‹ Back to my plans
          </Link>
        </Button>
      )}
      {back && (
        <Button type="button" variant="ghost" onClick={() => go(back)}>
          ‹ Back
        </Button>
      )}
      {priceBar}
    </div>
  )
}

type ContactDraft = {
  firstName: string
  surname: string
  phone: string
  email: string
  lga: string
  consent: boolean
}
const EMPTY_CONTACT: ContactDraft = {
  firstName: '',
  surname: '',
  phone: '',
  email: '',
  lga: '',
  consent: false,
}

function Summary({
  priced,
  state,
  items,
  showPrices,
  launchMode,
  contact,
  onContact,
  adjustLabel,
  onAdjust,
  onCreate,
  onDeposit,
  onTenure,
  onSubmit,
}: {
  priced: PricedBuild
  state: BuilderState
  items: BuilderItem[]
  showPrices: boolean
  launchMode: LaunchMode
  contact: ContactDraft
  onContact: (c: ContactDraft) => void
  /** "Adjust this quote": the plan being changed (no details, no deposit choice here). */
  adjustLabel: string | null
  onAdjust: (() => Promise<string | null>) | null
  /** Staff quotation tool: "Create quotation" instead of the customer's details. */
  onCreate: (() => Promise<string | null>) | null
  onDeposit: (pct: number) => void
  onTenure: (t: TenureMonths) => void
  onSubmit: (contact: {
    firstName: string
    surname: string
    phone: string
    email: string
    lga: string
    consent: true
  }) => Promise<string | null>
}) {
  const prices = showPrices && !priced.sample
  const [advice, setAdvice] = useState<string | null>(null)
  const c = contact
  const setC = (next: Omit<ContactDraft, 'consent'>) =>
    onContact({ ...next, consent: contact.consent })
  const consent = contact.consent
  const setConsent = (v: boolean) => onContact({ ...contact, consent: v })
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const pick = (group: string) =>
    state.items
      .map((x) => ({ x, i: items.find((it) => it.sku === x.sku) }))
      .filter((p) => p.i?.group === group)
  const facts = adviceFacts({
    inverterKva: pick('inverter')[0]?.i?.kva ?? 0,
    batteryKwh: pick('battery').reduce((t, p) => t + (p.i?.kwh ?? 0) * p.x.qty, 0),
    usableShare: 0.81,
    panelKw: pick('panels').reduce((t, p) => t + ((p.i?.watts ?? 0) * p.x.qty) / 1000, 0),
    loadKva: state.loadKva ?? null,
    monthly: prices ? priced.monthly : 0,
    months: priced.months,
    systemPrice: prices ? priced.systemPrice : 0,
    blocking: priced.blocking,
    warnings: priced.warnings,
  })
  const factsKey = facts.join('|')
  useEffect(() => {
    let live = true
    adviseBuild({ facts: factsKey.split('|') }).then((r) => {
      if (live && r.ok) setAdvice(r.text)
    })
    return () => {
      live = false
    }
  }, [factsKey])

  const lineTable = (
    <table className="w-full text-sm">
      <tbody>
        {priced.lines.map((l) => (
          <tr key={l.sku} className="border-b">
            <td className="py-2">
              {l.name}
              <span className="text-muted-foreground block text-xs">
                {l.qty}
                {items.find((i) => i.sku === l.sku)?.unit === 'metre' ? ' m' : ' ×'}
              </span>
            </td>
            {prices && <td className="py-2 text-right tabular-nums">{formatNaira(l.lineTotal)}</td>}
          </tr>
        ))}
        {priced.noMarkup.map((l) => (
          <tr key={l.label} className="border-b">
            <td className="py-2">{l.label}</td>
            {prices && <td className="py-2 text-right tabular-nums">{formatNaira(l.amount)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )

  // "Adjust this quote": no details and no deposit here — the plans page shows the new price.
  if (onAdjust) {
    return (
      <div className="space-y-5" data-testid="build-summary">
        <p className="bg-brand-mist rounded-xl p-3 text-sm" data-testid="adjust-note">
          Your changed {adjustLabel} plan. Your details and answers are kept; the plans page shows
          the new price at each deposit.
        </p>
        {lineTable}
        {prices && (
          <p className="text-sm" data-testid="build-total">
            Total amount payable at a {state.depositPct}% deposit:{' '}
            <strong>{formatNaira(priced.systemPrice)}</strong> · 0% interest
          </p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          type="button"
          className="h-12 w-full text-base sm:w-auto sm:px-10"
          disabled={sending || priced.blocking.length > 0}
          data-testid="update-plans"
          onClick={async () => {
            setError(null)
            setSending(true)
            const e = await onAdjust()
            setSending(false)
            if (e) setError(e)
          }}
        >
          {sending ? 'Updating…' : 'Update my plans'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5" data-testid="build-summary">
      <table className="w-full text-sm">
        <tbody>
          {priced.lines.map((l) => (
            <tr key={l.sku} className="border-b">
              <td className="py-2">
                {l.name}
                <span className="text-muted-foreground block text-xs">
                  {l.qty}
                  {items.find((i) => i.sku === l.sku)?.unit === 'metre' ? ' m' : ' ×'}
                </span>
              </td>
              {prices && (
                <td className="py-2 text-right tabular-nums">{formatNaira(l.lineTotal)}</td>
              )}
            </tr>
          ))}
          {priced.noMarkup.map((l) => (
            <tr key={l.label} className="border-b">
              <td className="py-2">{l.label}</td>
              {prices && <td className="py-2 text-right tabular-nums">{formatNaira(l.amount)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {prices && (
        <div className="bg-brand-mist space-y-4 rounded-2xl p-4">
          <div>
            <div className="flex justify-between text-sm">
              <span>Deposit</span>
              <strong>
                {state.depositPct}% · {formatNaira(priced.deposit)}
              </strong>
            </div>
            <Slider
              className="mt-3"
              min={20}
              max={95}
              step={5}
              value={[state.depositPct]}
              onValueChange={([v]) => onDeposit(v ?? 20)}
              aria-label="Deposit"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Months">
            {priced.tenures.map((t) => (
              <Button
                key={t}
                type="button"
                variant={state.tenure === t ? 'default' : 'outline'}
                className="h-11"
                aria-pressed={state.tenure === t}
                onClick={() => onTenure(t)}
              >
                {t} months
              </Button>
            ))}
          </div>
          <p className="text-lg">
            <strong>{formatNaira(priced.monthly)}</strong> a month for {priced.months} months
          </p>
          <p className="text-sm" data-testid="build-total">
            Total amount payable: <strong>{formatNaira(priced.systemPrice)}</strong> · 0% interest.
            Late payments attract 0.75% of the overdue amount per day.
          </p>
        </div>
      )}

      <ul
        className="text-muted-foreground list-disc space-y-1 pl-5 text-sm"
        data-testid="build-notes"
      >
        {priced.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      <section className="rounded-2xl border p-4" data-testid="build-advisor">
        <h2 className="text-brand-dark font-semibold">Advisor</h2>
        <p className="mt-1 text-sm">{advice ?? facts.join(' ')}</p>
      </section>

      {onCreate ? (
        <section className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            className={primary}
            disabled={sending || priced.blocking.length > 0}
            data-testid="create-quotation"
            onClick={async () => {
              setError(null)
              setSending(true)
              const e = await onCreate()
              setSending(false)
              if (e) setError(e)
            }}
          >
            {sending ? 'Creating…' : 'Create quotation'}
          </Button>
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-brand-dark text-lg font-bold">Your details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['firstName', 'First name', 'given-name', 'text'],
                ['surname', 'Surname', 'family-name', 'text'],
                ['phone', 'Phone number', 'tel', 'tel'],
                ['email', 'Email address', 'email', 'email'],
                ['lga', 'Local government area', 'address-level2', 'text'],
              ] as const
            ).map(([k, label, auto, type]) => (
              <div key={k}>
                <Label htmlFor={`c-${k}`}>{label}</Label>
                <Input
                  id={`c-${k}`}
                  type={type}
                  autoComplete={auto}
                  value={c[k]}
                  onChange={(e) => setC({ ...c, [k]: e.target.value })}
                  className="mt-1 h-11"
                />
              </div>
            ))}
          </div>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5"
            />
            I agree that Go4Solar may contact me about this system by phone, WhatsApp and email.
          </label>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            className={primary}
            disabled={sending || !consent || priced.blocking.length > 0}
            data-testid="build-submit"
            onClick={async () => {
              setError(null)
              setSending(true)
              const e = await onSubmit({ ...c, consent: true })
              setSending(false)
              if (e) setError(e)
            }}
          >
            {sending ? 'Saving…' : launchMode === 'live' ? 'Apply' : 'Submit'}
          </Button>
        </section>
      )}
    </div>
  )
}
