import { z } from 'zod'

import { CATEGORY_IDS, type CategoryId, type LoadItem, type LoadTotals } from '@/lib/load/types'
import { defaultEssential } from '@/lib/load/essential'
import { computeLoadTotals, DEFAULT_NIGHT_SHARE, LIMITS } from '@/lib/load/totals'
import { DEFAULT_SIZING_SETTINGS } from '@/lib/sizing/defaults'

/** One row of appliance_library, in camelCase. */
export type LibraryItem = {
  id: string
  category: CategoryId
  name: string
  defaultWatts: number
  surgeFactor: number
  dutyCycle: number
  defaultHours: number
  /** Part B: starting hours in the day and at night, and the essential tick. */
  defaultDayHours: number
  defaultNightHours: number
  defaultEssential: boolean
}

/** localStorage key; bump the version in STORAGE_VERSION when the shape changes. */
export const STORAGE_KEY = 'g4s.calculator.v1'
export const STORAGE_VERSION = 1

/** Hours per day for an item the user typed in (no library default to fall back on). */
export const CUSTOM_DEFAULT_HOURS = 4
/** …split evenly between the day and the night. */
export const CUSTOM_DEFAULT_DAY_HOURS = 2
export const CUSTOM_DEFAULT_NIGHT_HOURS = 2

/** Tapping a library item: add it, or bump qty if it is already on the list. */
export function addLibraryItem(items: LoadItem[], lib: LibraryItem, newId: string): LoadItem[] {
  const existing = items.find(
    (i) => !i.custom && i.name === lib.name && i.category === lib.category,
  )
  if (existing) {
    return items.map((i) =>
      i === existing ? { ...i, qty: Math.min(LIMITS.qty.max, i.qty + 1) } : i,
    )
  }
  return [
    ...items,
    {
      id: newId,
      category: lib.category,
      name: lib.name,
      watts: lib.defaultWatts,
      qty: 1,
      hoursPerDay: lib.defaultDayHours + lib.defaultNightHours,
      dayHours: lib.defaultDayHours,
      nightHours: lib.defaultNightHours,
      essential: lib.defaultEssential,
      surgeFactor: lib.surgeFactor,
      dutyCycle: lib.dutyCycle,
      custom: false,
    },
  ]
}

export function addCustomItem(
  items: LoadItem[],
  input: { name: string; watts: number; category: CategoryId },
  newId: string,
): LoadItem[] {
  return [
    ...items,
    {
      id: newId,
      category: input.category,
      name: input.name.trim(),
      watts: input.watts,
      qty: 1,
      hoursPerDay: CUSTOM_DEFAULT_HOURS,
      dayHours: CUSTOM_DEFAULT_DAY_HOURS,
      nightHours: CUSTOM_DEFAULT_NIGHT_HOURS,
      essential: false,
      surgeFactor: 1,
      dutyCycle: 1,
      custom: true,
    },
  ]
}

/** Most hours an item can run at night and in the day (the night lasts 12 h, so 12 + 12 = 24). */
export const HOURS_MAX = {
  night: DEFAULT_SIZING_SETTINGS.nightHours,
  day: 24 - DEFAULT_SIZING_SETTINGS.nightHours,
} as const

const tidy = (n: number) => Math.round(n * 10) / 10
const capped = (n: number, max: number) => tidy(Math.min(max, Math.max(0, n)))

/**
 * The day and night hours shown on an item's card. Older items (one "hours a day" figure) are
 * split with the usual night share, each part capped, so editing either never goes over 24.
 */
export function editableHours(item: LoadItem): { day: number; night: number } {
  if (item.dayHours !== undefined || item.nightHours !== undefined) {
    return { day: item.dayHours ?? 0, night: item.nightHours ?? 0 }
  }
  const night = capped(item.hoursPerDay * DEFAULT_NIGHT_SHARE, HOURS_MAX.night)
  return { day: capped(item.hoursPerDay - night, HOURS_MAX.day), night }
}

export function updateItem(
  items: LoadItem[],
  id: string,
  patch: Partial<
    Pick<
      LoadItem,
      | 'watts'
      | 'qty'
      | 'hoursPerDay'
      | 'dayHours'
      | 'nightHours'
      | 'essential'
      | 'wattsSource'
      | 'wattsRange'
    >
  >,
): LoadItem[] {
  return items.map((i) => {
    if (i.id !== id) return i
    const next = { ...i, ...patch }
    // Hours per day stays the sum of the day and night hours (each capped, so at most 24).
    if (patch.dayHours !== undefined || patch.nightHours !== undefined) {
      next.dayHours = capped(next.dayHours ?? 0, HOURS_MAX.day)
      next.nightHours = capped(next.nightHours ?? 0, HOURS_MAX.night)
      next.hoursPerDay = tidy(next.dayHours + next.nightHours)
    }
    return next
  })
}

export function removeItem(items: LoadItem[], id: string): LoadItem[] {
  return items.filter((i) => i.id !== id)
}

// What we accept back from localStorage. Anything else is dropped silently.
const storedItemSchema = z.object({
  id: z.string().min(1),
  category: z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]]),
  name: z.string().min(1).max(80),
  watts: z.number().min(LIMITS.watts.min).max(LIMITS.watts.max),
  qty: z.number().int().min(LIMITS.qty.min).max(LIMITS.qty.max),
  // Up to 48: a list saved with day + night over 24 is repaired below, not dropped.
  hoursPerDay: z.number().min(LIMITS.hoursPerDay.min).max(48),
  dayHours: z.number().min(0).max(48).optional(),
  nightHours: z.number().min(0).max(48).optional(),
  essential: z.boolean().optional(),
  surgeFactor: z.number().min(1).max(10),
  dutyCycle: z.number().gt(0).max(1),
  custom: z.boolean(),
  wattsSource: z.enum(['label', 'web', 'estimate']).optional(),
  wattsRange: z
    .object({ low: z.number().min(1).max(10000), high: z.number().min(1).max(10000) })
    .optional(),
})

const storedSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  items: z.array(z.unknown()),
})

/** True when at least one item is ticked Essential (the Essentials plan needs one). */
export function hasEssential(items: LoadItem[]): boolean {
  return items.some((i) => i.essential)
}

/** Parse a saved calculator state; corrupt data → []. Invalid single items are dropped. */
export function parseStoredItems(raw: string | null): LoadItem[] {
  if (!raw) return []
  try {
    const parsed = storedSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return []
    return parsed.data.items.flatMap((i) => {
      const r = storedItemSchema.safeParse(i)
      if (!r.success) return []
      const item = repairHours(r.data)
      if (!item) return []
      // Saved before the Essential tick: start with the default pre-ticks.
      return [{ ...item, essential: item.essential ?? defaultEssential(item) }]
    })
  } catch {
    return []
  }
}

/**
 * Saved hours that would not add up (day + night over 24, or a stale total) are put right:
 * day and night capped like the card, hours a day = their sum. An older single figure over 24
 * cannot be split sensibly, so that item is dropped. Pure.
 */
function repairHours<T extends LoadItem>(item: T): T | null {
  if (item.dayHours === undefined && item.nightHours === undefined) {
    return item.hoursPerDay <= LIMITS.hoursPerDay.max ? item : null
  }
  const dayHours = capped(item.dayHours ?? 0, HOURS_MAX.day)
  const nightHours = capped(item.nightHours ?? 0, HOURS_MAX.night)
  return { ...item, dayHours, nightHours, hoursPerDay: tidy(dayHours + nightHours) }
}

export function serialiseItems(items: LoadItem[]): string {
  return JSON.stringify({ version: STORAGE_VERSION, items })
}

/**
 * Totals for a screen: an item that fails the load checks is left out instead of breaking the
 * page (the list is repaired when it is saved and read again). Pure.
 */
export function safeTotals(items: LoadItem[]): LoadTotals {
  try {
    return computeLoadTotals(items)
  } catch {
    return computeLoadTotals(
      items.filter((i) => {
        try {
          computeLoadTotals([i])
          return true
        } catch {
          return false
        }
      }),
    )
  }
}
