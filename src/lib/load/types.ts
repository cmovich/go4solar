/** The seven appliance categories (PRD Feature 3). Display names live in the UI layer. */
export type CategoryId =
  'lighting' | 'tv_electronics' | 'kitchen' | 'cooling' | 'laundry' | 'water_outdoor' | 'business'

export const CATEGORY_IDS: readonly CategoryId[] = [
  'lighting',
  'tv_electronics',
  'kitchen',
  'cooling',
  'laundry',
  'water_outdoor',
  'business',
]

/** One line in the user's load list. */
export type LoadItem = {
  id: string
  category: CategoryId
  name: string
  /** Running watts of one unit, 1–10000. */
  watts: number
  /** Number of units, 1–100. */
  qty: number
  /** Hours used per day, 0–24 (= day + night hours when those are given). */
  hoursPerDay: number
  /** Hours used in the daytime (sun up). Missing on items saved before Part B. */
  dayHours?: number
  /** Hours used at night (no sun). Missing on items saved before Part B. */
  nightHours?: number
  /** The customer marked this item essential (the Essentials plan covers only these). */
  essential?: boolean
  /** Start-up draw as a multiple of running watts (1 = none; motors ≈ 3). */
  surgeFactor: number
  /** Share of the time the item actually draws power (fridge ≈ 0.4; most items 1). */
  dutyCycle: number
  /** True when the user typed the item in rather than picking it from the library. */
  custom: boolean
}

/** Running load and energy of a set of items (the whole list, or the essential items). */
export type LoadSubset = {
  count: number
  runningW: number
  /** runningW plus the single largest start-up surge among these items. */
  surgeW: number
  /** Daytime energy, kWh (2 dp). */
  dayKwh: number
  /** Night-time energy, kWh (2 dp). */
  nightKwh: number
  /** Running watts of the items used in the daytime (the midday check). */
  dayRunningW: number
}

export type LoadTotals = {
  /** Σ watts × qty. */
  runningW: number
  /** runningW plus the single largest start-up surge. */
  surgeW: number
  /** Σ watts × qty × hoursPerDay × dutyCycle / 1000, rounded to 2 dp. */
  dailyKwh: number
  byCategoryW: Record<CategoryId, number>
  /** Items of 1000 W or more (heavy-load warning). */
  heavyItems: LoadItem[]
  /** Daytime and night-time energy of the whole list, kWh (2 dp). */
  dayKwh: number
  nightKwh: number
  /** Running watts of the items used in the daytime. */
  dayRunningW: number
  /** The essential items only (count 0 when none are marked). */
  essential: LoadSubset
}
