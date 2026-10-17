import { describe, expect, it } from 'vitest'

import {
  MAX_FINANCED_SHARE,
  financedShare,
  offeredTenures,
  tenureListProblem,
  tenureRateProblem,
} from './tenures'

describe('offeredTenures (what a customer may choose)', () => {
  it('the tenures captured in the estimate, shortest first', () => {
    expect(offeredTenures({ 12: 0.24, 3: 0.24, 6: 0.24, 9: 0.24 })).toEqual([3, 6, 9, 12])
    expect(offeredTenures({ 3: 0.24, 6: 0.24, 9: 0.24, 12: 0.24, 18: 0.24 })).toEqual([
      3, 6, 9, 12, 18,
    ])
  })

  it('a tenure switched off since the estimate is no longer shown', () => {
    expect(offeredTenures({ 3: 0.24, 12: 0.24, 18: 0.24 }, [3, 6, 9, 12])).toEqual([3, 12])
  })

  it('a tenure switched on after the estimate is not added (the estimate has no rate for it)', () => {
    expect(offeredTenures({ 12: 0.24 }, [12, 24])).toEqual([12])
  })

  it('never empty: falls back to the estimate tenures if none is still on', () => {
    expect(offeredTenures({ 12: 0.24 }, [24])).toEqual([12])
  })

  it('old estimates without per-tenure rates: 3, 6, 9 and 12', () => {
    expect(offeredTenures(undefined)).toEqual([3, 6, 9, 12])
  })
})

describe('financedShare (the "f" in P = C / (1 − f(1 − d)))', () => {
  it('is the yearly pricing rate times the years', () => {
    expect(financedShare(0.24, 12)).toBeCloseTo(0.24)
    expect(financedShare(0.24, 18)).toBeCloseTo(0.36)
    expect(financedShare(0.24, 24)).toBeCloseTo(0.48)
  })
})

describe('tenureRateProblem (admin checks before saving)', () => {
  const row = (over: object) => ({
    tenureMonths: 24 as const,
    enabled: true,
    expectedFunderRate: 0.16,
    spread: 0.06,
    defaultBuffer: 0.02,
    ...over,
  })

  it('a switched-off tenure needs nothing', () => {
    expect(
      tenureRateProblem(
        row({ enabled: false, expectedFunderRate: null, spread: null, defaultBuffer: null }),
        0.2,
      ),
    ).toBeNull()
  })

  it('switching on needs all three rates', () => {
    expect(tenureRateProblem(row({ spread: null }), 0.2)).toBe(
      '24 months: enter the funder rate, spread and buffer before switching it on.',
    )
  })

  it('a rate that would make the price run away is refused, in plain words', () => {
    // 0.5 a year × 2 years × 80% financed = 0.8 > the limit.
    expect(
      tenureRateProblem(row({ expectedFunderRate: 0.3, spread: 0.15, defaultBuffer: 0.05 }), 0.2),
    ).toBe(
      `24 months: a 50% yearly rate is too high for this length (the price would be more than ${Math.round(1 / (1 - MAX_FINANCED_SHARE))}× the cost). Lower the rate.`,
    )
    expect(tenureRateProblem(row({}), 0.2)).toBeNull()
  })
})

describe('tenureListProblem', () => {
  it('12 months must stay on (waiting-list estimates are priced at 12 months)', () => {
    expect(tenureListProblem([{ tenureMonths: 12, enabled: false }])).toBe(
      '12 months must stay switched on: estimates are priced at 12 months.',
    )
    expect(tenureListProblem([{ tenureMonths: 12, enabled: true }])).toBeNull()
  })
})

describe('tenureListText (customer wording)', () => {
  it('lists the switched-on lengths in plain English', async () => {
    const { tenureListText } = await import('./tenures')
    expect(tenureListText([3, 6, 9, 12])).toBe('3, 6, 9 or 12 months')
    expect(tenureListText([3, 6, 9, 12, 18, 24])).toBe('3, 6, 9, 12, 18 or 24 months')
    expect(tenureListText([12])).toBe('12 months')
  })
})
