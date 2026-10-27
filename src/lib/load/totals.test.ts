import { describe, expect, it } from 'vitest'

import { makeItem, sampleHomeItems } from './load.fixture'
import { LoadValidationError, computeLoadTotals } from './totals'

describe('computeLoadTotals', () => {
  it('matches the PRD worked example', () => {
    const t = computeLoadTotals(sampleHomeItems)
    expect(t.runningW).toBe(480)
    expect(t.surgeW).toBe(780)
    expect(t.dailyKwh).toBe(3.72)
  })

  it('breaks running watts down by category', () => {
    const t = computeLoadTotals(sampleHomeItems)
    expect(t.byCategoryW).toEqual({
      lighting: 100,
      kitchen: 150,
      tv_electronics: 80,
      cooling: 150,
      laundry: 0,
      water_outdoor: 0,
      business: 0,
    })
  })

  it('returns all zeros for an empty list without throwing', () => {
    const t = computeLoadTotals([])
    expect(t.runningW).toBe(0)
    expect(t.surgeW).toBe(0)
    expect(t.dailyKwh).toBe(0)
    expect(t.heavyItems).toEqual([])
    expect(Object.values(t.byCategoryW).every((w) => w === 0)).toBe(true)
  })

  it('adds only the single largest surge to running watts', () => {
    const items = [
      makeItem({ id: 'a', watts: 100, surgeFactor: 3 }), // +200
      makeItem({ id: 'b', watts: 500, surgeFactor: 2 }), // +500 ← largest
      makeItem({ id: 'c', watts: 50, qty: 4, surgeFactor: 1 }),
    ]
    const t = computeLoadTotals(items)
    expect(t.runningW).toBe(800)
    expect(t.surgeW).toBe(1300)
  })

  it('surge is per unit, not multiplied by quantity', () => {
    const t = computeLoadTotals([makeItem({ watts: 150, qty: 2, surgeFactor: 3 })])
    expect(t.runningW).toBe(300)
    expect(t.surgeW).toBe(600)
  })

  it('applies duty cycle to energy but not to running watts', () => {
    const t = computeLoadTotals([makeItem({ watts: 1000, hoursPerDay: 10, dutyCycle: 0.5 })])
    expect(t.runningW).toBe(1000)
    expect(t.dailyKwh).toBe(5)
  })

  it('rounds daily kWh to 2 decimals', () => {
    const t = computeLoadTotals([makeItem({ watts: 7, qty: 3, hoursPerDay: 5, dutyCycle: 0.33 })])
    // 7×3×5×0.33 = 34.65 Wh → 0.03465 kWh → 0.03
    expect(t.dailyKwh).toBe(0.03)
  })

  it('lists items of 1000 W or more as heavy', () => {
    const iron = makeItem({ id: 'iron', name: 'Pressing iron', watts: 1200, hoursPerDay: 0.5 })
    const kettle = makeItem({ id: 'kettle', name: 'Kettle', watts: 1000 })
    const t = computeLoadTotals([...sampleHomeItems, iron, kettle])
    expect(t.heavyItems.map((i) => i.id)).toEqual(['iron', 'kettle'])
  })

  describe('validation', () => {
    it.each([
      ['watts below 1', { watts: 0 }],
      ['watts above 10000', { watts: 10001 }],
      ['qty below 1', { qty: 0 }],
      ['qty above 100', { qty: 101 }],
      ['hours below 0', { hoursPerDay: -1 }],
      ['hours above 24', { hoursPerDay: 25 }],
      ['non-integer qty', { qty: 1.5 }],
      ['NaN watts', { watts: Number.NaN }],
    ])('rejects %s', (_label, overrides) => {
      expect(() => computeLoadTotals([makeItem(overrides)])).toThrow(LoadValidationError)
    })

    it('accepts the boundaries', () => {
      expect(() =>
        computeLoadTotals([
          makeItem({ watts: 1, qty: 1, hoursPerDay: 0 }),
          makeItem({ watts: 10000, qty: 100, hoursPerDay: 24 }),
        ]),
      ).not.toThrow()
    })

    it('names the offending item and field in the error', () => {
      try {
        computeLoadTotals([makeItem({ id: 'x1', name: 'Oven', watts: 20000 })])
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(LoadValidationError)
        const e = err as LoadValidationError
        expect(e.itemId).toBe('x1')
        expect(e.field).toBe('watts')
        expect(e.message).toContain('Oven')
      }
    })
  })
})

// Part B: day and night energy, and the essential items on their own.
describe('day, night and essential totals', () => {
  it('uses each item’s own day and night hours', () => {
    const t = computeLoadTotals([
      makeItem({ id: 'tv', watts: 100, qty: 2, dayHours: 2, nightHours: 4, hoursPerDay: 6 }),
      makeItem({
        id: 'fr',
        watts: 150,
        dutyCycle: 0.4,
        dayHours: 12,
        nightHours: 12,
        hoursPerDay: 24,
      }),
    ])
    expect(t.dayKwh).toBe(1.12) // 200×2 + 150×12×0.4 = 400 + 720 Wh
    expect(t.nightKwh).toBe(1.52) // 200×4 + 150×12×0.4 = 800 + 720 Wh
    expect(t.dayRunningW).toBe(350)
  })

  it('splits hours of older items (no day/night) with the night share', () => {
    const t = computeLoadTotals([makeItem({ id: 'a', watts: 100, hoursPerDay: 10 })], {
      nightShare: 0.6,
    })
    expect(t.nightKwh).toBe(0.6)
    expect(t.dayKwh).toBe(0.4)
  })

  it('an item used only at night does not count as daytime running load', () => {
    const t = computeLoadTotals([
      makeItem({ id: 'l', watts: 50, dayHours: 0, nightHours: 6, hoursPerDay: 6 }),
    ])
    expect(t.dayRunningW).toBe(0)
  })

  it('totals the essential items on their own', () => {
    const t = computeLoadTotals([
      makeItem({
        id: 'a',
        watts: 400,
        qty: 2,
        essential: true,
        dayHours: 6,
        nightHours: 6,
        hoursPerDay: 12,
      }),
      makeItem({
        id: 'b',
        watts: 300,
        surgeFactor: 3,
        essential: true,
        dayHours: 0,
        nightHours: 8,
        hoursPerDay: 8,
      }),
      makeItem({
        id: 'c',
        watts: 1000,
        surgeFactor: 3,
        dayHours: 6,
        nightHours: 0,
        hoursPerDay: 6,
      }),
    ])
    expect(t.runningW).toBe(2100)
    expect(t.essential).toEqual({
      count: 2,
      runningW: 1100,
      surgeW: 1700, // 1100 + 300 × (3 − 1)
      dayKwh: 4.8,
      nightKwh: 7.2,
      dayRunningW: 800,
    })
  })

  it('rejects day + night hours above 24', () => {
    expect(() =>
      computeLoadTotals([makeItem({ id: 'x', dayHours: 14, nightHours: 12, hoursPerDay: 24 })]),
    ).toThrow(LoadValidationError)
  })
})
