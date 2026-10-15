'use client'

import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { Calculator } from '@/components/calculator/Calculator'
import type { LaunchMode } from '@/config/site'
import { STORAGE_KEY, parseStoredItems, type LibraryItem } from '@/lib/calculator/store'
import type { CurrentEnergy } from '@/lib/energy/currentSpend'
import type { LoadItem } from '@/lib/load/types'
import type { Estimate } from '@/lib/quotes/buildEstimate'
import type { Plan } from '@/lib/sizing/types'
import { flowStart } from '@/lib/waitlist/entry'

import {
  BusinessStep,
  ContributionStep,
  EmailStep,
  EnergyStep,
  NameStep,
  PhoneStep,
  PlansStep,
  PreparingStep,
  ThankYouStep,
  TotalsStep,
  WhoForStep,
  type NameValues,
  type PhoneValues,
} from './steps'

/**
 * 1 calculator · 2 totals · 3 preparing · 4 phone · 5 email · 6 name/state · 7 who is it for ·
 * 8 business details (business only) · 9 energy spend · 10 plans · 11 contribution · 12 thank you
 */
export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

const slide = {
  enter: (dir: number) => ({ x: dir > 0 ? '60%' : '-60%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-60%' : '60%', opacity: 0 }),
}

export function WaitlistFlow({
  library,
  messagingLive,
  launchMode,
  photoLookup,
}: {
  library: LibraryItem[]
  messagingLive: boolean
  launchMode: LaunchMode
  photoLookup: boolean
}) {
  const [step, setStep] = useState<Step>(1)
  const [dir, setDir] = useState(1)
  const [items, setItems] = useState<LoadItem[]>([])
  const [leadId, setLeadId] = useState<string | null>(null)
  const [name, setName] = useState<NameValues | null>(null)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [current, setCurrent] = useState<CurrentEnergy | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [pausing, setPausing] = useState(false)
  const [phoneValues, setPhoneValues] = useState<PhoneValues | null>(null)
  const [email, setEmail] = useState('')
  const [isBusiness, setIsBusiness] = useState(false)
  // Live visitors from /calculate start at the totals; "Back to my appliances" returns there.
  const [backToAppliances, setBackToAppliances] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      // Storage blocked: start with the calculator.
    }
    const start = flowStart({
      launchMode,
      fromCalculator: new URLSearchParams(window.location.search).get('from') === 'calculate',
      storedItems: parseStoredItems(stored),
    })
    setItems(start.items)
    setStep(start.step)
    setBackToAppliances(start.backToAppliances)
    setReady(true)
  }, [launchMode])

  const go = useCallback(
    (next: Step) => {
      setDir(next > step ? 1 : -1)
      setStep(next)
      window.scrollTo({ top: 0 })
    },
    [step],
  )

  /** Short loading pause (PRD: 1–2 s at most) between saved screens. */
  const pauseThen = useCallback(
    (next: Step, ms = 800) => {
      setPausing(true)
      window.setTimeout(() => {
        setPausing(false)
        go(next)
      }, ms)
    },
    [go],
  )

  const toAppliances = useCallback(() => {
    if (backToAppliances) router.push(backToAppliances)
    else go(1)
  }, [backToAppliances, router, go])

  /** Where Back (and a swipe right) goes from each screen. */
  const back: Partial<Record<Step, () => void>> = {
    2: toAppliances,
    4: () => go(2),
    5: () => go(4),
    6: () => go(5),
    7: () => go(6),
    8: () => go(7),
    9: () => go(isBusiness ? 8 : 7),
    10: () => go(9),
    11: () => go(10),
  }

  // Step 3 is a timed loading screen.
  useEffect(() => {
    if (step !== 3) return
    const t = window.setTimeout(() => go(4), 1200)
    return () => window.clearTimeout(t)
  }, [step, go])

  function onDragEnd(_: unknown, info: PanInfo) {
    const goBack = back[step]
    if (goBack && info.offset.x > 90 && !pausing) goBack()
  }

  const firstName = name?.firstName ?? ''
  if (!ready) return <div className="min-h-[50vh]" aria-busy="true" />

  return (
    <div className="relative overflow-x-hidden">
      {step >= 4 && step <= 12 && <Progress step={step} />}
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={step}
          custom={dir}
          variants={slide}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'tween', duration: 0.28, ease: 'easeOut' }}
          drag={back[step] ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={onDragEnd}
          data-step={step}
        >
          {step === 1 && (
            <Calculator
              library={library}
              launchMode={launchMode}
              photoLookup={photoLookup}
              onContinue={(list) => {
                setItems(list)
                go(2)
              }}
            />
          )}
          {step === 2 && <TotalsStep items={items} onBack={toAppliances} onNext={() => go(3)} />}
          {step === 3 && <PreparingStep />}
          {step === 4 && (
            <PhoneStep
              items={items}
              leadId={leadId}
              initial={phoneValues}
              pausing={pausing}
              onBack={() => go(2)}
              onSaved={(id, values) => {
                setLeadId(id)
                setPhoneValues(values)
                pauseThen(5)
              }}
            />
          )}
          {step === 5 && leadId && (
            <EmailStep
              leadId={leadId}
              initial={email}
              pausing={pausing}
              onBack={() => go(4)}
              onSaved={(value) => {
                setEmail(value)
                pauseThen(6)
              }}
            />
          )}
          {step === 6 && leadId && (
            <NameStep
              leadId={leadId}
              initial={name}
              onBack={() => go(5)}
              onSaved={(values, est) => {
                setName(values)
                setEstimate(est)
                go(7)
              }}
            />
          )}
          {step === 7 && leadId && (
            <WhoForStep
              leadId={leadId}
              onBack={() => go(6)}
              onSaved={(type) => {
                setIsBusiness(type === 'business')
                go(type === 'business' ? 8 : 9)
              }}
            />
          )}
          {step === 8 && leadId && (
            <BusinessStep leadId={leadId} onBack={() => go(7)} onSaved={() => go(9)} />
          )}
          {step === 9 && leadId && (
            <EnergyStep
              leadId={leadId}
              onBack={() => go(isBusiness ? 8 : 7)}
              onSaved={(c) => {
                setCurrent(c)
                // Live mode: the priced plans, tenure choice and account step live on /plans.
                if (launchMode === 'live') router.push(`/plans?estimate=${leadId}`)
                else go(10)
              }}
            />
          )}
          {step === 10 && leadId && estimate && (
            <PlansStep
              leadId={leadId}
              firstName={firstName}
              estimate={estimate}
              current={current}
              onBack={() => go(9)}
              onChosen={(p) => {
                setPlan(p)
                go(11)
              }}
            />
          )}
          {step === 11 && leadId && estimate && plan && (
            <ContributionStep
              leadId={leadId}
              estimate={estimate}
              plan={plan}
              onBack={() => go(10)}
              onDone={() => go(12)}
            />
          )}
          {step === 12 && leadId && (
            <ThankYouStep
              firstName={firstName}
              leadId={leadId}
              messagingLive={messagingLive}
              launchMode={launchMode}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Progress({ step }: { step: Step }) {
  const screens: Step[] = [4, 5, 6, 7, 9, 10, 11, 12]
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
      {screens.map((s) => (
        <li
          key={s}
          aria-current={s === step ? 'step' : undefined}
          className={`h-2 flex-1 rounded-full ${s <= step ? 'bg-brand-green' : 'bg-brand-mist'}`}
        />
      ))}
    </ol>
  )
}
