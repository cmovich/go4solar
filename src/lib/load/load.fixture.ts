import type { LoadItem } from './types'

/**
 * The PRD's worked example: a small home.
 * Expected totals: runningW 480, surgeW 780, dailyKwh 3.72.
 */
export const sampleHomeItems: LoadItem[] = [
  {
    id: 'led',
    category: 'lighting',
    name: 'LED bulb',
    watts: 10,
    qty: 10,
    hoursPerDay: 6,
    surgeFactor: 1,
    dutyCycle: 1,
    custom: false,
  },
  {
    id: 'fridge',
    category: 'kitchen',
    name: 'Fridge',
    watts: 150,
    qty: 1,
    hoursPerDay: 24,
    surgeFactor: 3,
    dutyCycle: 0.4,
    custom: false,
  },
  {
    id: 'tv43',
    category: 'tv_electronics',
    name: '43" TV',
    watts: 80,
    qty: 1,
    hoursPerDay: 6,
    surgeFactor: 1,
    dutyCycle: 1,
    custom: false,
  },
  {
    id: 'fan',
    category: 'cooling',
    name: 'Ceiling fan',
    watts: 75,
    qty: 2,
    hoursPerDay: 8,
    surgeFactor: 1,
    dutyCycle: 1,
    custom: false,
  },
]

/** Helper for tests: a valid item with any field overridden. */
export function makeItem(overrides: Partial<LoadItem> = {}): LoadItem {
  return {
    id: 'item',
    category: 'lighting',
    name: 'Test item',
    watts: 100,
    qty: 1,
    hoursPerDay: 1,
    surgeFactor: 1,
    dutyCycle: 1,
    custom: false,
    // Not essential unless a test says so (pass essential: undefined for an older save).
    essential: false,
    ...overrides,
  }
}
