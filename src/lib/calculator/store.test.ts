import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'

import {
  addCustomItem,
  addLibraryItem,
  editableHours,
  HOURS_MAX,
  hasEssential,
  parseStoredItems,
  removeItem,
  safeTotals,
  updateItem,
  type LibraryItem,
} from './store'

const led: LibraryItem = {
  id: 'lib-led',
  category: 'lighting',
  name: 'LED bulb',
  defaultWatts: 10,
  surgeFactor: 1,
  dutyCycle: 1,
  defaultHours: 6,
  defaultDayHours: 0,
  defaultNightHours: 6,
  defaultEssential: true,
}
const fridge: LibraryItem = {
  id: 'lib-fridge',
  category: 'kitchen',
  name: 'Fridge',
  defaultWatts: 150,
  surgeFactor: 3,
  dutyCycle: 0.4,
  defaultHours: 24,
  defaultDayHours: 12,
  defaultNightHours: 12,
  defaultEssential: true,
}
const tv: LibraryItem = {
  id: 'lib-tv',
  category: 'tv_electronics',
  name: '43" TV',
  defaultWatts: 80,
  surgeFactor: 1,
  dutyCycle: 1,
  defaultHours: 6,
  defaultDayHours: 2.5,
  defaultNightHours: 3.5,
  defaultEssential: false,
}
const fan: LibraryItem = {
  id: 'lib-fan',
  category: 'cooling',
  name: 'Ceiling fan',
  defaultWatts: 75,
  surgeFactor: 1,
  dutyCycle: 1,
  defaultHours: 8,
  defaultDayHours: 3,
  defaultNightHours: 5,
  defaultEssential: true,
}

describe('calculator store', () => {
  it('adds a library item with its defaults, qty 1, not custom', () => {
    const items = addLibraryItem([], led, 'a')
    expect(items).toEqual([
      {
        id: 'a',
        category: 'lighting',
        name: 'LED bulb',
        watts: 10,
        qty: 1,
        hoursPerDay: 6,
        dayHours: 0,
        nightHours: 6,
        essential: true,
        surgeFactor: 1,
        dutyCycle: 1,
        custom: false,
      },
    ])
  })

  it('adding the same library item again increases qty instead of duplicating', () => {
    let items = addLibraryItem([], led, 'a')
    items = addLibraryItem(items, led, 'b')
    expect(items).toHaveLength(1)
    expect(items[0]?.qty).toBe(2)
  })

  it('adds a custom item with surge 1, duty 1 and 4 h/day default', () => {
    const items = addCustomItem([], { name: 'Chandelier', watts: 120, category: 'lighting' }, 'c')
    expect(items[0]).toMatchObject({
      id: 'c',
      name: 'Chandelier',
      watts: 120,
      qty: 1,
      hoursPerDay: 4,
      surgeFactor: 1,
      dutyCycle: 1,
      custom: true,
    })
  })

  it('edits watts, qty and hours of one item only', () => {
    let items = addLibraryItem([], led, 'a')
    items = addLibraryItem(items, fridge, 'b')
    items = updateItem(items, 'a', { qty: 10 })
    items = updateItem(items, 'b', { watts: 180, hoursPerDay: 20 })
    expect(items[0]).toMatchObject({ qty: 10, watts: 10 })
    expect(items[1]).toMatchObject({ watts: 180, hoursPerDay: 20, qty: 1 })
  })

  it('removes an item by id', () => {
    let items = addLibraryItem([], led, 'a')
    items = addLibraryItem(items, fridge, 'b')
    items = removeItem(items, 'a')
    expect(items.map((i) => i.id)).toEqual(['b'])
  })

  it('does not mutate the previous state', () => {
    const before = addLibraryItem([], led, 'a')
    const frozen = structuredClone(before)
    updateItem(before, 'a', { qty: 5 })
    removeItem(before, 'a')
    addLibraryItem(before, fridge, 'b')
    expect(before).toEqual(frozen)
  })

  it('rebuilds the Prompt 3 fixture and its totals', () => {
    let items = addLibraryItem([], led, 'led')
    items = updateItem(items, 'led', { qty: 10 })
    items = addLibraryItem(items, fridge, 'fridge')
    items = addLibraryItem(items, tv, 'tv43')
    items = addLibraryItem(items, fan, 'fan')
    items = updateItem(items, 'fan', { qty: 2 })
    // Same as the fixture, plus each item's day/night hours and essential tick (Part B).
    expect(items).toEqual(sampleHomeItems.map((i) => expect.objectContaining(i)))
    const t = computeLoadTotals(items)
    expect(t.runningW).toBe(480)
    expect(t.surgeW).toBe(780)
    expect(t.dailyKwh).toBe(3.72)
  })
})

describe('parseStoredItems', () => {
  it('returns the items when the stored JSON is valid', () => {
    const json = JSON.stringify({ version: 1, items: sampleHomeItems })
    expect(parseStoredItems(json)).toEqual(sampleHomeItems.map((i) => expect.objectContaining(i)))
  })

  it('returns [] for missing, corrupt or wrong-version data', () => {
    expect(parseStoredItems(null)).toEqual([])
    expect(parseStoredItems('not json')).toEqual([])
    expect(parseStoredItems(JSON.stringify({ version: 2, items: [] }))).toEqual([])
    expect(parseStoredItems(JSON.stringify({ version: 1, items: [{ id: 1 }] }))).toEqual([])
  })

  it('drops items that fail the load limits instead of crashing', () => {
    const bad = { ...sampleHomeItems[0]!, watts: 99999 }
    const json = JSON.stringify({ version: 1, items: [bad, sampleHomeItems[1]] })
    expect(parseStoredItems(json)).toEqual([expect.objectContaining(sampleHomeItems[1]!)])
  })
})

// Part B: hours in the day and at night, and the "essential" tick.
describe('day and night hours, essential', () => {
  it('a library item starts with its day/night defaults and essential tick', () => {
    const [item] = addLibraryItem([], led, 'n1')
    expect(item).toMatchObject({ dayHours: 0, nightHours: 6, hoursPerDay: 6, essential: true })
  })

  it('a custom item starts with 2 h day + 2 h night, not essential', () => {
    const [item] = addCustomItem([], { name: 'Pump', watts: 500, category: 'water_outdoor' }, 'c1')
    expect(item).toMatchObject({ dayHours: 2, nightHours: 2, hoursPerDay: 4, essential: false })
  })

  it('changing day or night hours keeps hours per day as their sum', () => {
    const items = addLibraryItem([], tv, 't1')
    const after = updateItem(items, 't1', { nightHours: 5 })
    expect(after[0]).toMatchObject({ dayHours: 2.5, nightHours: 5, hoursPerDay: 7.5 })
  })

  it('hasEssential: the calculator needs at least one essential item', () => {
    const items = addLibraryItem([], tv, 't1')
    expect(hasEssential(items)).toBe(false)
    expect(hasEssential(updateItem(items, 't1', { essential: true }))).toBe(true)
  })

  it('the essential tick can be changed', () => {
    const items = addLibraryItem([], tv, 't1')
    expect(updateItem(items, 't1', { essential: true })[0]!.essential).toBe(true)
  })

  it('saved items keep day/night hours and the tick; older saves without them still load', () => {
    const saved = JSON.stringify({
      version: 1,
      items: [
        { ...addLibraryItem([], tv, 't1')[0] },
        {
          id: 'old',
          category: 'lighting',
          name: 'Old bulb',
          watts: 10,
          qty: 1,
          hoursPerDay: 6,
          surgeFactor: 1,
          dutyCycle: 1,
          custom: false,
        },
      ],
    })
    const [a, b] = parseStoredItems(saved)
    expect(a).toMatchObject({ dayHours: 2.5, nightHours: 3.5, essential: false })
    expect(b).not.toHaveProperty('dayHours')
    // An older save gets the default pre-tick (lights are essential).
    expect(b!.essential).toBe(true)
  })
})

// Saved lists from older visits must never break a page (PR #24 review, 2 Nov).
describe('saved lists from older visits', () => {
  const fridge = {
    id: 'f',
    category: 'kitchen',
    name: 'Fridge',
    watts: 150,
    qty: 1,
    surgeFactor: 3,
    dutyCycle: 0.4,
    custom: false,
  }
  const save = (items: object[]) => JSON.stringify({ version: 1, items })

  it('day + night over 24 is repaired (each capped at 12 h), never kept as is', () => {
    const [a] = parseStoredItems(
      save([{ ...fridge, hoursPerDay: 24, dayHours: 13, nightHours: 12 }]),
    )
    expect(a).toMatchObject({ dayHours: 12, nightHours: 12, hoursPerDay: 24 })
    expect(() => computeLoadTotals([a!])).not.toThrow()
  })

  it('a list saved after the hours bug (26.4 h) is repaired, not dropped', () => {
    const [a] = parseStoredItems(
      save([{ ...fridge, hoursPerDay: 26.4, dayHours: 12, nightHours: 14.399999999999999 }]),
    )
    expect(a).toMatchObject({ dayHours: 12, nightHours: 12, hoursPerDay: 24 })
  })

  it('hours per day always equals day + night when both are saved', () => {
    const [a] = parseStoredItems(save([{ ...fridge, hoursPerDay: 3, dayHours: 4, nightHours: 5 }]))
    expect(a).toMatchObject({ dayHours: 4, nightHours: 5, hoursPerDay: 9 })
  })

  it('every repaired list adds up without an error', () => {
    for (const day of [0, 6, 12, 13, 24]) {
      for (const night of [0, 6, 12, 14.4, 24]) {
        const items = parseStoredItems(
          save([
            { ...fridge, hoursPerDay: Math.min(24, day + night), dayHours: day, nightHours: night },
          ]),
        )
        expect(() => computeLoadTotals(items)).not.toThrow()
      }
    }
  })

  it('editableHours: an older single figure splits into clean, capped day and night hours', () => {
    const old = { ...fridge, category: 'kitchen' as const, hoursPerDay: 24, essential: false }
    expect(editableHours(old)).toEqual({ day: 12, night: 12 })
    expect(editableHours({ ...old, hoursPerDay: 6 })).toEqual({ day: 2.4, night: 3.6 })
    expect(editableHours({ ...old, dayHours: 3, nightHours: 5 })).toEqual({ day: 3, night: 5 })
    expect(HOURS_MAX).toEqual({ day: 12, night: 12 })
  })

  it('editing an older item can never push day + night over 24', () => {
    const old = { ...fridge, category: 'kitchen' as const, hoursPerDay: 24, essential: false }
    const h = editableHours(old)
    const [after] = updateItem([old], 'f', { dayHours: HOURS_MAX.day, nightHours: h.night })
    expect(after!.hoursPerDay).toBeLessThanOrEqual(24)
    expect(() => computeLoadTotals([after!])).not.toThrow()
    const [over] = updateItem([old], 'f', { dayHours: 20, nightHours: 20 })
    expect(over).toMatchObject({ dayHours: 12, nightHours: 12, hoursPerDay: 24 })
  })
})

describe('safeTotals (screens never crash on one bad item)', () => {
  it('adds up the good items and leaves out a broken one', () => {
    const good = addLibraryItem([], led, 'a')
    const bad = { ...good[0]!, id: 'b', dayHours: 13, nightHours: 12, hoursPerDay: 25 }
    const t = safeTotals([...good, bad])
    expect(t.runningW).toBe(computeLoadTotals(good).runningW)
    expect(safeTotals([]).runningW).toBe(0)
  })
})

describe('Part C: watts from a photo', () => {
  it('the source and estimated range are saved and read back', () => {
    const [item] = addLibraryItem([], led, 'p1')
    const est = updateItem([item!], 'p1', {
      watts: 170,
      wattsSource: 'estimate',
      wattsRange: { low: 100, high: 200 },
    })
    const back = parseStoredItems(JSON.stringify({ version: 1, items: est }))
    expect(back[0]).toMatchObject({
      watts: 170,
      wattsSource: 'estimate',
      wattsRange: { low: 100, high: 200 },
    })
  })

  it('typing the watts clears the photo source', () => {
    const [item] = addLibraryItem([], led, 'p2')
    const est = updateItem([item!], 'p2', {
      watts: 170,
      wattsSource: 'estimate',
      wattsRange: { low: 100, high: 200 },
    })
    const typed = updateItem(est, 'p2', {
      watts: 60,
      wattsSource: undefined,
      wattsRange: undefined,
    })
    const back = parseStoredItems(JSON.stringify({ version: 1, items: typed }))
    expect(back[0]!.wattsSource).toBeUndefined()
    expect(back[0]!.wattsRange).toBeUndefined()
  })
})
