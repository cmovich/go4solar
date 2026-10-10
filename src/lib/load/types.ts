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
  /** Hours used per day, 0–24. */
  hoursPerDay: number
  /** Start-up draw as a multiple of running watts (1 = none; motors ≈ 3). */
  surgeFactor: number
  /** Share of the time the item actually draws power (fridge ≈ 0.4; most items 1). */
  dutyCycle: number
  /** True when the user typed the item in rather than picking it from the library. */
  custom: boolean
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
}
