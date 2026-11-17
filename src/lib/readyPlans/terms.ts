import { z } from 'zod'

import type { ReadyPlan } from './types'

/**
 * The terms every ready-made plan shares (Admin → Pricing → Ready-made plans, settings key
 * `ready_plan_terms`): the monthly rate (total = financed × (1 + rate × months)) and the discount
 * for paying in full (off the 12-month total payable). Pure. The rate and discount stored on each
 * plan row are no longer used. Quotes keep the figures they were priced with.
 */
/** The settings row that holds the terms. */
export const READY_TERMS_KEY = 'ready_plan_terms'

export type ReadyTerms = { monthlyRate: number; fullDiscount: number }

export const DEFAULT_READY_TERMS: ReadyTerms = { monthlyRate: 0.04, fullDiscount: 0.2 }

const rate = z.number().min(0).max(0.2)
const discount = z.number().min(0).max(0.89)

/** The setting, field by field; a missing or wrong field takes the default. */
export function readyTermsFrom(value: unknown): ReadyTerms {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const r = rate.safeParse(v.monthlyRate)
  const d = discount.safeParse(v.fullDiscount)
  return {
    monthlyRate: r.success ? r.data : DEFAULT_READY_TERMS.monthlyRate,
    fullDiscount: d.success ? d.data : DEFAULT_READY_TERMS.fullDiscount,
  }
}

export function withTerms(p: ReadyPlan, t: ReadyTerms): ReadyPlan {
  return { ...p, monthlyRate: t.monthlyRate, fullDiscount: t.fullDiscount }
}

const share = (pct: number) => Math.round(pct * 10_000) / 1_000_000

/** Admin form: percentages (monthly rate 0–20%, pay-in-full discount 0–89%). */
export const readyTermsForm = z
  .object({
    monthlyRatePct: z
      .number({ error: 'Enter the monthly rate.' })
      .min(0)
      .max(20, 'The monthly rate is at most 20%.'),
    fullDiscountPct: z
      .number({ error: 'Enter the discount.' })
      .min(0)
      .max(89, 'The discount is at most 89%.'),
  })
  .transform((v): ReadyTerms => ({
    monthlyRate: share(v.monthlyRatePct),
    fullDiscount: share(v.fullDiscountPct),
  }))

export function termsToForm(t: ReadyTerms) {
  return {
    monthlyRatePct: Math.round(t.monthlyRate * 1_000_000) / 10_000,
    fullDiscountPct: Math.round(t.fullDiscount * 1_000_000) / 10_000,
  }
}
