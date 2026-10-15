import { z } from 'zod'

import { CATEGORY_IDS, type CategoryId, type LoadItem } from '@/lib/load/types'
import { LIMITS } from '@/lib/load/totals'

/** One row of appliance_library, in camelCase. */
export type LibraryItem = {
  id: string
  category: CategoryId
  name: string
  defaultWatts: number
  surgeFactor: number
  dutyCycle: number
  defaultHours: number
}

/** localStorage key; bump the version in STORAGE_VERSION when the shape changes. */
export const STORAGE_KEY = 'g4s.calculator.v1'
export const STORAGE_VERSION = 1

/** Hours per day for an item the user typed in (no library default to fall back on). */
export const CUSTOM_DEFAULT_HOURS = 4

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
      hoursPerDay: lib.defaultHours,
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
      surgeFactor: 1,
      dutyCycle: 1,
      custom: true,
    },
  ]
}

export function updateItem(
  items: LoadItem[],
  id: string,
  patch: Partial<Pick<LoadItem, 'watts' | 'qty' | 'hoursPerDay'>>,
): LoadItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i))
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
  hoursPerDay: z.number().min(LIMITS.hoursPerDay.min).max(LIMITS.hoursPerDay.max),
  surgeFactor: z.number().min(1).max(10),
  dutyCycle: z.number().gt(0).max(1),
  custom: z.boolean(),
})

const storedSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  items: z.array(z.unknown()),
})

/** Parse a saved calculator state; corrupt data → []. Invalid single items are dropped. */
export function parseStoredItems(raw: string | null): LoadItem[] {
  if (!raw) return []
  try {
    const parsed = storedSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return []
    return parsed.data.items.flatMap((i) => {
      const r = storedItemSchema.safeParse(i)
      return r.success ? [r.data] : []
    })
  } catch {
    return []
  }
}

export function serialiseItems(items: LoadItem[]): string {
  return JSON.stringify({ version: STORAGE_VERSION, items })
}
