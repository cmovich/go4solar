import type { SiteAnswers } from '@/lib/wizard/questions'

import type { BuilderStep } from './store'

/**
 * Installation and delivery rule (Semako, 26 Nov 2026). An order with only ONE type of product
 * (one inverter, only batteries, only panels; any quantity) has no installation, no delivery,
 * no installer or delivery questions and no accessories pack. Two or more types (inverter +
 * battery, inverter + panels, battery + panels, a complete system…) ask both questions and are
 * charged only for a "Yes". Accessories and wires never count as a type of their own.
 */
const MAIN_TYPES = new Set(['inverter', 'battery', 'panels', 'lights'])

export type OrderShape = 'empty' | 'single' | 'multi'

/** `groups`: the group of each chosen item (inverter, battery, panels, lights, accessories…). */
export function orderShape(groups: string[]): OrderShape {
  if (groups.length === 0) return 'empty'
  const main = new Set(groups.filter((g) => MAIN_TYPES.has(g)))
  return main.size >= 2 ? 'multi' : 'single'
}

export type StepFacts = {
  scope?: 'complete' | 'some'
  shape: OrderShape
  /** Panels are in the order (mounting and roof questions are only about panels). */
  panels: boolean
  site: SiteAnswers
}

/**
 * The builder's screens in order: start → (what they already have) → items → installer and
 * delivery (two or more types, early) → mounting (panels only) → roof type, rack (roof only) →
 * height (roof, and only when there is an installation to price) → wire (a system) → summary.
 */
export function builderSteps(f: StepFacts): BuilderStep[] {
  const out: BuilderStep[] = ['start']
  if (f.scope === 'some') out.push('existing')
  out.push('items')
  const multi = f.shape === 'multi'
  if (multi) out.push('installer')
  if (f.panels) {
    out.push('mounting')
    if (f.site.mounting === 'roof') {
      out.push('roofType', 'rack')
      if (multi) out.push('height')
    }
  }
  if (multi) out.push('wire')
  out.push('summary')
  return out
}

export function nextBuilderStep(step: BuilderStep, f: StepFacts): BuilderStep {
  const list = builderSteps(f)
  const i = list.indexOf(step)
  return i < 0 ? 'summary' : (list[i + 1] ?? 'summary')
}

export function prevBuilderStep(step: BuilderStep, f: StepFacts): BuilderStep | null {
  const list = builderSteps(f)
  const i = list.indexOf(step)
  return i <= 0 ? (i === 0 ? null : 'items') : list[i - 1]!
}
