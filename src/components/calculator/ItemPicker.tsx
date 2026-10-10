'use client'

import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LibraryItem } from '@/lib/calculator/store'
import { CATEGORY_LABELS } from '@/lib/load/categories'
import type { CategoryId } from '@/lib/load/types'

export function ItemPicker({
  category,
  library,
  onClose,
  onAdd,
  onAddCustom,
}: {
  category: CategoryId | null
  library: LibraryItem[]
  onClose: () => void
  onAdd: (item: LibraryItem) => void
  onAddCustom: (category: CategoryId) => void
}) {
  const items = category ? library.filter((l) => l.category === category) : []

  return (
    <Dialog open={category !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-brand-dark">
            {category ? CATEGORY_LABELS[category] : ''}
          </DialogTitle>
          <DialogDescription>Tap an item to add it. Typical watts are shown.</DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            The appliance list could not be loaded. You can still add your own item below.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onAdd(item)}
                  className="hover:bg-brand-mist focus-visible:bg-brand-mist flex min-h-12 w-full items-center justify-between gap-3 px-1 py-3 text-left focus-visible:outline-none"
                >
                  <span className="text-brand-dark font-medium">{item.name}</span>
                  <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                    {item.defaultWatts.toLocaleString('en-US')} W
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          {category && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onAddCustom(category)}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add your own
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
