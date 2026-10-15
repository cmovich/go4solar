import { describe, expect, it } from 'vitest'

import type { LoadItem } from '@/lib/load/types'

import { CALCULATE_PATH, flowStart, plansLinkFromCalculator } from './entry'

const fan: LoadItem = {
  id: 'f',
  category: 'cooling',
  name: 'Standing fan',
  watts: 60,
  qty: 2,
  hoursPerDay: 8,
  surgeFactor: 1,
  dutyCycle: 1,
  custom: false,
}

// Fix-up 1 #1 (both modes): /calculate → "See my solar plans" opened the calculator a second time.
// Whenever appliances are saved on this device the flow starts at the total load, however the
// visitor arrived; only a visitor with no appliances starts with the calculator.
describe('flowStart (where the details flow begins)', () => {
  it('saved appliances: starts at the total load, Back returns to /calculate', () => {
    expect(flowStart({ storedItems: [fan] })).toEqual({
      step: 2,
      items: [fan],
      backToAppliances: CALCULATE_PATH,
    })
  })

  it('nothing saved: the calculator is the first step', () => {
    expect(flowStart({ storedItems: [] })).toEqual({
      step: 1,
      items: [],
      backToAppliances: null,
    })
  })

  it('the "See my solar plans" link marks where the visitor came from, in both modes', () => {
    expect(plansLinkFromCalculator('live')).toBe('/get-started?from=calculate')
    expect(plansLinkFromCalculator('prelaunch')).toBe('/waitlist?from=calculate')
  })
})
