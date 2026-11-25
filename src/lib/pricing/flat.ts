import { DEFAULT_READY_TERMS, readyTermsFrom, type ReadyTerms } from '@/lib/readyPlans/terms'

import type { FlatTerms, RateByTenure, TenureMonths } from './types'

/**
 * Home quotes (calculator plans and the builder) on the ready-made plan terms (Semako,
 * 25 Nov 2026), from Admin → Pricing → Ready-made plans → "Terms for all plans". Pure.
 *   price      = items at cost + base margins + installation + delivery
 *   deposit    = d × price (20%–95%)
 *   total      = deposit + (price − deposit) × (1 + monthly rate × months)
 *   cash price = the 12-month total at the lowest deposit × (1 − discount), whatever the slider
 * The Tenure rates table (pricing_rates) is not used for these quotes.
 */
export const HOME_TENURES: readonly TenureMonths[] = [6, 9, 12]

export function flatTermsFrom(value: unknown): FlatTerms {
  return { kind: 'flat', ...readyTermsFrom(value) }
}

export const DEFAULT_FLAT_TERMS: FlatTerms = { kind: 'flat', ...DEFAULT_READY_TERMS }

export const flatTerms = (t: ReadyTerms): FlatTerms => ({ kind: 'flat', ...t })

/** The charge on the financed amount for a length (0.48 for 12 months at 4%). */
export const flatCharge = (t: FlatTerms, months: number) => t.monthlyRate * months

/**
 * The lengths offered, as a yearly-rate map (the estimate's record of what it offers; the
 * values are the monthly rate × 12, for screens that show a yearly figure to staff).
 */
export function flatRates(t: FlatTerms): RateByTenure {
  return Object.fromEntries(HOME_TENURES.map((n) => [n, t.monthlyRate * 12])) as RateByTenure
}
