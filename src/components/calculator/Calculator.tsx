'use client'

import { useEffect, useMemo, useState } from 'react'

import type { LaunchMode } from '@/config/site'
import {
  STORAGE_KEY,
  addCustomItem,
  addLibraryItem,
  parseStoredItems,
  removeItem,
  serialiseItems,
  hasEssential,
  updateItem,
  type LibraryItem,
} from '@/lib/calculator/store'
import { defaultEssential } from '@/lib/load/essential'
import { computeLoadTotals } from '@/lib/load/totals'
import type { CategoryId, LoadItem, LoadTotals } from '@/lib/load/types'

import { AddCustomDialog } from './AddCustomDialog'
import { CategoryTiles } from './CategoryTiles'
import { HeavyLoadWarning } from './HeavyLoadWarning'
import { ItemCard } from './ItemCard'
import { ItemPicker } from './ItemPicker'
import { Results } from './Results'
import { TotalsBar } from './TotalsBar'

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const EMPTY_TOTALS = computeLoadTotals([])

/** Totals never throw at the user: a half-typed value just falls back to the last good totals. */
function safeTotals(items: LoadItem[]): LoadTotals {
  try {
    return computeLoadTotals(items)
  } catch {
    return EMPTY_TOTALS
  }
}

export function Calculator({
  library,
  launchMode,
  photoLookup,
  onContinue,
}: {
  library: LibraryItem[]
  launchMode: LaunchMode
  /** Show the AI photo lookup (see photoLookupAvailable). */
  photoLookup: boolean
  /** Waiting-list mode: replaces the "See my solar plans" link with a Continue button. */
  onContinue?: (items: LoadItem[]) => void
}) {
  const [items, setItems] = useState<LoadItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [pickerCategory, setPickerCategory] = useState<CategoryId | null>(null)
  const [customCategory, setCustomCategory] = useState<CategoryId | null>(null)

  // Restore a previous session from this device, then keep it saved.
  useEffect(() => {
    try {
      setItems(parseStoredItems(window.localStorage.getItem(STORAGE_KEY)))
    } catch {
      // Private mode or blocked storage: start empty.
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, serialiseItems(items))
    } catch {
      // Storage full or blocked: the session simply is not remembered.
    }
  }, [items, hydrated])

  const totals = useMemo(() => safeTotals(items), [items])

  return (
    <div className="pb-28">
      <h1 className="text-brand-dark text-3xl font-bold tracking-tight sm:text-4xl">
        Calculate your load
      </h1>
      <p className="text-muted-foreground mt-2 text-base">
        Tap a category, then tap the appliances you want to power. Change the watts, quantity or
        hours on any card. Totals update as you go.
      </p>

      <section className="mt-8" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="text-brand-dark text-lg font-semibold">
          1. Pick your appliances
        </h2>
        <CategoryTiles items={items} onSelect={setPickerCategory} />
      </section>

      <section className="mt-10" aria-labelledby="items-heading">
        <h2 id="items-heading" className="text-brand-dark text-lg font-semibold">
          2. Your appliances{' '}
          <span className="text-muted-foreground text-base font-normal">({items.length})</span>
        </h2>
        {items.length === 0 ? (
          <p className="bg-brand-mist text-muted-foreground mt-4 rounded-xl p-6 text-center text-base">
            Nothing yet. Tap a category above to add your first appliance.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                photoLookup={photoLookup}
                onChange={(patch) => setItems((prev) => updateItem(prev, item.id, patch))}
                onRemove={() => setItems((prev) => removeItem(prev, item.id))}
              />
            ))}
          </ul>
        )}
        <HeavyLoadWarning items={totals.heavyItems} />
      </section>

      <Results
        totals={totals}
        hasItems={items.length > 0}
        launchMode={launchMode}
        onContinue={onContinue ? () => onContinue(items) : undefined}
        needsEssential={items.length > 0 && !hasEssential(items)}
        onSuggestEssential={() =>
          setItems((prev) => prev.map((i) => (defaultEssential(i) ? { ...i, essential: true } : i)))
        }
      />

      <TotalsBar totals={totals} />

      <ItemPicker
        category={pickerCategory}
        library={library}
        onClose={() => setPickerCategory(null)}
        onAdd={(lib) => {
          setItems((prev) => addLibraryItem(prev, lib, newId()))
          setPickerCategory(null)
        }}
        onAddCustom={(category) => {
          setPickerCategory(null)
          setCustomCategory(category)
        }}
      />

      <AddCustomDialog
        category={customCategory}
        onClose={() => setCustomCategory(null)}
        onAdd={(input) => {
          setItems((prev) => addCustomItem(prev, input, newId()))
          setCustomCategory(null)
        }}
      />
    </div>
  )
}
