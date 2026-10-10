'use client'

import {
  Briefcase,
  Droplets,
  Fan,
  Lightbulb,
  Refrigerator,
  Tv,
  WashingMachine,
  type LucideIcon,
} from 'lucide-react'

import { CATEGORY_LABELS } from '@/lib/load/categories'
import { CATEGORY_IDS, type CategoryId, type LoadItem } from '@/lib/load/types'

const ICONS: Record<CategoryId, LucideIcon> = {
  lighting: Lightbulb,
  tv_electronics: Tv,
  kitchen: Refrigerator,
  cooling: Fan,
  laundry: WashingMachine,
  water_outdoor: Droplets,
  business: Briefcase,
}

export function CategoryTiles({
  items,
  onSelect,
}: {
  items: LoadItem[]
  onSelect: (category: CategoryId) => void
}) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {CATEGORY_IDS.map((id) => {
        const Icon = ICONS[id]
        const count = items.filter((i) => i.category === id).reduce((n, i) => n + i.qty, 0)
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onSelect(id)}
              className="bg-brand-mist hover:border-brand-green focus-visible:ring-brand-green relative flex min-h-24 w-full flex-col items-start justify-between rounded-xl border-2 border-transparent p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <Icon className="text-brand-green h-7 w-7" aria-hidden />
              <span className="text-brand-dark mt-3 text-sm leading-tight font-semibold">
                {CATEGORY_LABELS[id]}
              </span>
              {count > 0 && (
                <span
                  className="bg-brand-green absolute top-3 right-3 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white"
                  aria-label={`${count} added`}
                >
                  {count}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
