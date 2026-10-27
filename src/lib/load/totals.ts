import {
  CATEGORY_IDS,
  type CategoryId,
  type LoadItem,
  type LoadSubset,
  type LoadTotals,
} from './types'

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
    public readonly field: 'watts' | 'qty' | 'hoursPerDay' | 'dayHours' | 'nightHours',
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
  for (const f of ['dayHours', 'nightHours'] as const) {
    const v = item[f]
    if (v !== undefined && !(Number.isFinite(v) && v >= 0 && v <= 24)) {
      throw new LoadValidationError(item.id, f, `${item.name}: ${f} must be between 0 and 24`)
    }
  }
  if ((item.dayHours ?? 0) + (item.nightHours ?? 0) > 24) {
    throw new LoadValidationError(
      item.id,
      'nightHours',
      `${item.name}: day and night hours add up to more than 24`,
    )
  }
}

/** Share of an older item's hours (no day/night given) counted as night use. */
export const DEFAULT_NIGHT_SHARE = 0.6

/** Day and night hours of an item; older items split their hours with the night share. */
export function dayNightHours(item: LoadItem, nightShare = DEFAULT_NIGHT_SHARE) {
  if (item.dayHours !== undefined || item.nightHours !== undefined) {
    return { day: item.dayHours ?? 0, night: item.nightHours ?? 0 }
  }
  return { day: item.hoursPerDay * (1 - nightShare), night: item.hoursPerDay * nightShare }
}

const kwh2 = (wh: number) => Math.round(wh / 10) / 100

function subset(items: LoadItem[], nightShare: number): LoadSubset {
  let runningW = 0
  let largestSurgeW = 0
  let dayWh = 0
  let nightWh = 0
  let dayRunningW = 0
  for (const item of items) {
    const lineW = item.watts * item.qty
    const { day, night } = dayNightHours(item, nightShare)
    runningW += lineW
    dayWh += lineW * day * item.dutyCycle
    nightWh += lineW * night * item.dutyCycle
    if (day > 0) dayRunningW += lineW
    largestSurgeW = Math.max(largestSurgeW, item.watts * (item.surgeFactor - 1))
  }
  return {
    count: items.length,
    runningW,
    surgeW: runningW + largestSurgeW,
    dayKwh: kwh2(dayWh),
    nightKwh: kwh2(nightWh),
    dayRunningW,
  }
}

/**
 * Running watts, surge watts and daily energy for a load list.
 * Pure: no rounding except dailyKwh (2 dp), so the sizing engine works with exact watts.
 */
export function computeLoadTotals(
  items: LoadItem[],
  opts: { nightShare?: number } = {},
): LoadTotals {
  const nightShare = opts.nightShare ?? DEFAULT_NIGHT_SHARE
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

  const all = subset(items, nightShare)
  return {
    runningW,
    surgeW: runningW + largestSurgeW,
    dailyKwh: Math.round(dailyWh / 10) / 100,
    byCategoryW,
    heavyItems,
    dayKwh: all.dayKwh,
    nightKwh: all.nightKwh,
    dayRunningW: all.dayRunningW,
    essential: subset(
      items.filter((i) => i.essential),
      nightShare,
    ),
  }
}
