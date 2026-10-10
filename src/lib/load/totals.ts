import { CATEGORY_IDS, type CategoryId, type LoadItem, type LoadTotals } from './types'

/** Items at or above this draw get the heavy-load warning (PRD Feature 3). */
export const HEAVY_ITEM_WATTS = 1000

export const LIMITS = {
  watts: { min: 1, max: 10000 },
  qty: { min: 1, max: 100 },
  hoursPerDay: { min: 0, max: 24 },
} as const

export class LoadValidationError extends Error {
  constructor(
    public readonly itemId: string,
    public readonly field: 'watts' | 'qty' | 'hoursPerDay',
    message: string,
  ) {
    super(message)
    this.name = 'LoadValidationError'
  }
}

function check(item: LoadItem, field: keyof typeof LIMITS, integer: boolean): void {
  const value = item[field]
  const { min, max } = LIMITS[field]
  const ok =
    Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))
  if (!ok) {
    throw new LoadValidationError(
      item.id,
      field,
      `${item.name}: ${field} must be ${integer ? 'a whole number ' : ''}between ${min} and ${max} (got ${value})`,
    )
  }
}

function validate(item: LoadItem): void {
  check(item, 'watts', false)
  check(item, 'qty', true)
  check(item, 'hoursPerDay', false)
}

/**
 * Running watts, surge watts and daily energy for a load list.
 * Pure: no rounding except dailyKwh (2 dp), so the sizing engine works with exact watts.
 */
export function computeLoadTotals(items: LoadItem[]): LoadTotals {
  const byCategoryW = Object.fromEntries(CATEGORY_IDS.map((c) => [c, 0])) as Record<
    CategoryId,
    number
  >
  let runningW = 0
  let largestSurgeW = 0
  let dailyWh = 0
  const heavyItems: LoadItem[] = []

  for (const item of items) {
    validate(item)
    const lineW = item.watts * item.qty
    runningW += lineW
    byCategoryW[item.category] += lineW
    dailyWh += lineW * item.hoursPerDay * item.dutyCycle
    // Motors start one at a time: only the single biggest start-up draw is added.
    largestSurgeW = Math.max(largestSurgeW, item.watts * (item.surgeFactor - 1))
    if (item.watts >= HEAVY_ITEM_WATTS) heavyItems.push(item)
  }

  return {
    runningW,
    surgeW: runningW + largestSurgeW,
    dailyKwh: Math.round(dailyWh / 10) / 100,
    byCategoryW,
    heavyItems,
  }
}
