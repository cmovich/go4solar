'use client'

import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { Calculator } from '@/components/calculator/Calculator'
import type { LaunchMode } from '@/config/site'
import type { LibraryItem } from '@/lib/calculator/store'
import type { CurrentEnergy } from '@/lib/energy/currentSpend'
import type { LoadItem } from '@/lib/load/types'
import type { Estimate } from '@/lib/quotes/buildEstimate'
import type { Plan } from '@/lib/sizing/types'

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
} from './steps'

/**
 * 1 calculator · 2 totals · 3 preparing · 4 phone · 5 email · 6 name/state · 7 who is it for ·
 * 8 business details (business only) · 9 energy spend · 10 plans · 11 contribution · 12 thank you
 */
export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

/** Screens the visitor can swipe back from (never past a saved step's validation). */
const SWIPE_BACK: Partial<Record<Step, Step>> = { 2: 1, 4: 2, 5: 4, 6: 5, 7: 6, 8: 7, 9: 7, 11: 10 }

const slide = {
  enter: (dir: number) => ({ x: dir > 0 ? '60%' : '-60%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-60%' : '60%', opacity: 0 }),
}

export function WaitlistFlow({
  library,
  messagingLive,
  launchMode,
}: {
  library: LibraryItem[]
  messagingLive: boolean
  launchMode: LaunchMode
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
  const router = useRouter()

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

  // Step 3 is a timed loading screen.
  useEffect(() => {
    if (step !== 3) return
    const t = window.setTimeout(() => go(4), 1200)
    return () => window.clearTimeout(t)
  }, [step, go])

  function onDragEnd(_: unknown, info: PanInfo) {
    const back = SWIPE_BACK[step]
    if (back && info.offset.x > 90 && !pausing) go(back)
  }

  const firstName = name?.firstName ?? ''

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
          drag={SWIPE_BACK[step] ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={onDragEnd}
          data-step={step}
        >
          {step === 1 && (
            <Calculator
              library={library}
              launchMode={launchMode}
              onContinue={(list) => {
                setItems(list)
                go(2)
              }}
            />
          )}
          {step === 2 && <TotalsStep items={items} onBack={() => go(1)} onNext={() => go(3)} />}
          {step === 3 && <PreparingStep />}
          {step === 4 && (
            <PhoneStep
              items={items}
              pausing={pausing}
              onSaved={(id) => {
                setLeadId(id)
                pauseThen(5)
              }}
            />
          )}
          {step === 5 && leadId && (
            <EmailStep leadId={leadId} pausing={pausing} onSaved={() => pauseThen(6)} />
          )}
          {step === 6 && leadId && (
            <NameStep
              leadId={leadId}
              onSaved={(values, est) => {
                setName(values)
                setEstimate(est)
                go(7)
              }}
            />
          )}
          {step === 7 && leadId && (
            <WhoForStep leadId={leadId} onSaved={(type) => go(type === 'business' ? 8 : 9)} />
          )}
          {step === 8 && leadId && (
            <BusinessStep leadId={leadId} onBack={() => go(7)} onSaved={() => go(9)} />
          )}
          {step === 9 && leadId && (
            <EnergyStep
              leadId={leadId}
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
