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
describe('flowStart (where the details flow begins)', () => {
  for (const launchMode of ['live', 'prelaunch'] as const) {
    it(`${launchMode}, from /calculate with saved appliances: starts at the total load`, () => {
      expect(flowStart({ launchMode, fromCalculator: true, storedItems: [fan] })).toEqual({
        step: 2,
        items: [fan],
        backToAppliances: CALCULATE_PATH,
      })
    })

    it(`${launchMode}, from /calculate but nothing saved: the calculator`, () => {
      expect(flowStart({ launchMode, fromCalculator: true, storedItems: [] })).toEqual({
        step: 1,
        items: [],
        backToAppliances: null,
      })
    })

    it(`${launchMode}, opened directly: the calculator is the first step`, () => {
      expect(flowStart({ launchMode, fromCalculator: false, storedItems: [fan] }).step).toBe(1)
    })
  }

  it('the "See my solar plans" link marks where the visitor came from, in both modes', () => {
    expect(plansLinkFromCalculator('live')).toBe('/get-started?from=calculate')
    expect(plansLinkFromCalculator('prelaunch')).toBe('/waitlist?from=calculate')
  })
})
