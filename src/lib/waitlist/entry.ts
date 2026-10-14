import type { LaunchMode } from '@/config/site'
import type { LoadItem } from '@/lib/load/types'

export const CALCULATE_PATH = '/calculate'
/** Live mode: /calculate's "See my solar plans" link. */
export const PLANS_FROM_CALCULATOR = '/get-started?from=calculate'

/**
 * Where the details flow starts. Live visitors who come from /calculate with appliances saved on
 * this device skip the calculator (it is never shown twice) and start at "Your total load";
 * "Back to my appliances" then returns to /calculate. Everyone else starts with the calculator.
 */
export function flowStart(input: {
  launchMode: LaunchMode
  fromCalculator: boolean
  storedItems: LoadItem[]
}): { step: 1 | 2; items: LoadItem[]; backToAppliances: string | null } {
  if (input.launchMode === 'live' && input.fromCalculator && input.storedItems.length > 0) {
    return { step: 2, items: input.storedItems, backToAppliances: CALCULATE_PATH }
  }
  return { step: 1, items: [], backToAppliances: null }
}
