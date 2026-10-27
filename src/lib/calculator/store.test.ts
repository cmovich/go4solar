import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'

import {
  addCustomItem,
  addLibraryItem,
  parseStoredItems,
  removeItem,
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
    expect(parseStoredItems(json)).toEqual(sampleHomeItems)
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
    expect(parseStoredItems(json)).toEqual([sampleHomeItems[1]])
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
  })
})
