import { defaultEssential } from '@/lib/load/essential'

/** Calculator defaults of an appliance_library row: hours in the day, at night, essential tick. */
export type DayNightDefaults = {
  defaultDayHours: number
  defaultNightHours: number
  defaultEssential: boolean
}

const DAYTIME_CATEGORIES = ['kitchen', 'laundry', 'water_outdoor', 'business']

/**
 * The row's own columns (migration 0024). Without them (before the migration), the same split
 * the migration seeds: all-day items 12/12, lighting at night, kitchen/laundry/water/business
 * in the day, the rest 60% at night (half hours).
 */
export function dayNightDefaults(row: {
  category: string
  name?: string
  default_hours: number | string
  default_day_hours?: number | string | null
  default_night_hours?: number | string | null
  default_essential?: boolean | null
}): DayNightDefaults {
  if (
    row.default_day_hours !== undefined &&
    row.default_day_hours !== null &&
    row.default_night_hours !== undefined &&
    row.default_night_hours !== null
  ) {
    return {
      defaultDayHours: Number(row.default_day_hours),
      defaultNightHours: Number(row.default_night_hours),
      defaultEssential: row.default_essential === true,
    }
  }
  const h = Number(row.default_hours)
  let night: number
  if (h >= 24) night = 12
  else if (row.category === 'lighting') night = Math.min(h, 12)
  else if (DAYTIME_CATEGORIES.includes(row.category)) night = 0
  else night = Math.min(Math.round(h * 0.6 * 2) / 2, 12)
  const day = h >= 24 ? 12 : Math.min(h - night, 12)
  return {
    defaultDayHours: day,
    defaultNightHours: night,
    defaultEssential: defaultEssential({ category: row.category, name: row.name ?? '' }),
  }
}
