import { describe, expect, it } from 'vitest'

import type { LoadItem } from '@/lib/load/types'

import { CALCULATE_PATH, PLANS_FROM_CALCULATOR, flowStart } from './entry'

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

// Fix-up 1 #1: /calculate → "See my solar plans" opened the calculator a second time.
describe('flowStart (where /get-started begins)', () => {
  it('live, from /calculate with saved appliances: starts at the total load, calculator not shown', () => {
    expect(flowStart({ launchMode: 'live', fromCalculator: true, storedItems: [fan] })).toEqual({
      step: 2,
      items: [fan],
      backToAppliances: CALCULATE_PATH,
    })
  })

  it('from /calculate but nothing saved (other device, cleared storage): the calculator', () => {
    expect(flowStart({ launchMode: 'live', fromCalculator: true, storedItems: [] })).toEqual({
      step: 1,
      items: [],
      backToAppliances: null,
    })
  })

  it('opened directly (or prelaunch): the calculator is the first step, as before', () => {
    expect(flowStart({ launchMode: 'live', fromCalculator: false, storedItems: [fan] }).step).toBe(
      1,
    )
    expect(
      flowStart({ launchMode: 'prelaunch', fromCalculator: true, storedItems: [fan] }).step,
    ).toBe(1)
  })

  it('the live "See my solar plans" link marks where the visitor came from', () => {
    expect(PLANS_FROM_CALCULATOR).toBe('/get-started?from=calculate')
  })
})
