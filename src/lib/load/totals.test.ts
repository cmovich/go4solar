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
