import { describe, expect, it } from 'vitest'

import { leadPlan } from './leadPlan'

describe('leadPlan: the quote a waiting-list person already has (when staff picked none)', () => {
  it('a ready-made plan, a built system, or the plan chosen in Get Started / the calculator', () => {
    expect(
      leadPlan({
        builder: { kind: 'ready', plan: { slug: 'oga-boss' } },
        chosen_plan: null,
        deposit_share: 0.3,
      }),
    ).toEqual({ planKind: 'ready', planRef: 'oga-boss', depositShare: 0.3, months: 12 })
    expect(
      leadPlan({ builder: { kind: 'builder' }, chosen_plan: 'comfort', deposit_share: null }),
    ).toEqual({ planKind: 'builder', planRef: 'builder', depositShare: 0.2, months: 12 })
    expect(leadPlan({ builder: null, chosen_plan: 'comfort', deposit_share: '0.25' })).toEqual({
      planKind: 'estimate',
      planRef: 'comfort',
      depositShare: 0.25,
      months: 12,
    })
  })
  it('nothing chosen: null (the quote exports blank, with a warning)', () => {
    expect(leadPlan({ builder: null, chosen_plan: null, deposit_share: null })).toBeNull()
  })
})
