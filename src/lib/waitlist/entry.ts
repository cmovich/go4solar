import type { LaunchMode } from '@/config/site'
import type { LoadItem } from '@/lib/load/types'

export const CALCULATE_PATH = '/calculate'

/** /calculate's "See my solar plans" link: the details flow, marked as coming from the calculator. */
export function plansLinkFromCalculator(mode: LaunchMode): string {
  return mode === 'live' ? '/get-started?from=calculate' : '/waitlist?from=calculate'
}

/**
 * Where the details flow starts (both modes). Visitors with appliances saved on this device (from
 * /calculate, or an earlier visit) skip the calculator, so it is never shown twice, and start at
 * "Your total load"; "Back to my appliances" then returns to /calculate. Only a visitor with no
 * appliances starts with the calculator.
 */
export function flowStart(input: { storedItems: LoadItem[] }): {
  step: 1 | 2
  items: LoadItem[]
  backToAppliances: string | null
} {
  if (input.storedItems.length > 0) {
    return { step: 2, items: input.storedItems, backToAppliances: CALCULATE_PATH }
  }
  return { step: 1, items: [], backToAppliances: null }
}
