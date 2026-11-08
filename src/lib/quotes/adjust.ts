import type { QuoteResult } from '@/lib/pricing/types'
import type { Plan, SystemSize } from '@/lib/sizing/types'

import type { Estimate } from './buildEstimate'

/**
 * "Adjust this quote": the plan the customer changed in the builder replaces that plan in the
 * same estimate (priced like every plan: lowest deposit, 12 months), marked adjusted. The other
 * plans and every answer stay as they were. Pure.
 */
export function adjustPlan(
  estimate: Estimate,
  plan: Plan,
  quote: QuoteResult,
  size: Pick<
    SystemSize,
    | 'inverterKva'
    | 'batteryKwh'
    | 'panelCount'
    | 'panelKw'
    | 'backupHoursFullLoad'
    | 'realisticBackupHours'
  >,
  panelWatts: number | null,
): Estimate {
  const old = estimate.plans[plan]
  return {
    ...estimate,
    plans: {
      ...estimate.plans,
      [plan]: {
        ...old,
        quote,
        size: { ...old.size, ...size, ...(panelWatts ? { panelWatts } : {}) },
        adjusted: true,
      },
    },
  }
}
