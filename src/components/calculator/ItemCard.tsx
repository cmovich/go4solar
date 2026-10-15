'use client'

import { HelpCircle, X } from 'lucide-react'
import { useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CATEGORY_LABELS } from '@/lib/load/categories'
import { LIMITS } from '@/lib/load/totals'
import type { LoadItem } from '@/lib/load/types'

import { WattsLookupDialog } from './WattsLookupDialog'

type Patch = Partial<Pick<LoadItem, 'watts' | 'qty' | 'hoursPerDay'>>

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function ItemCard({
  item,
  onChange,
  onRemove,
  photoLookup,
}: {
  item: LoadItem
  onChange: (patch: Patch) => void
  onRemove: () => void
  /** The "snap the label" watts lookup (hidden when there is no vision provider). */
  photoLookup: boolean
}) {
  const [lookupOpen, setLookupOpen] = useState(false)

  function numberField(field: keyof Patch, integer: boolean) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = integer ? parseInt(e.target.value, 10) : parseFloat(e.target.value)
      if (Number.isNaN(raw)) return // mid-edit (empty box): keep the last good value
      const { min, max } = LIMITS[field]
      onChange({ [field]: clamp(raw, min, max) })
    }
  }

  const lineW = item.watts * item.qty

  return (
    <li
      className="rounded-xl border bg-white p-4 shadow-sm"
      data-testid="item-card"
      data-name={item.name}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-brand-dark font-semibold">{item.name}</p>
          <p className="text-muted-foreground text-xs">
            {CATEGORY_LABELS[item.category]}
            {item.custom && ' · your own'}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className="text-muted-foreground hover:bg-brand-mist hover:text-brand-dark -mt-1 -mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor={`${item.id}-watts`} className="text-xs">
            Watts
          </Label>
          <div className="mt-1 flex items-center gap-1">
            <Input
              id={`${item.id}-watts`}
              type="number"
              inputMode="numeric"
              min={LIMITS.watts.min}
              max={LIMITS.watts.max}
              value={item.watts}
              onChange={numberField('watts', false)}
              className="h-11 text-base"
            />
            {photoLookup && (
              <button
                type="button"
                onClick={() => setLookupOpen(true)}
                aria-label={`Find the watts of ${item.name} from a photo`}
                title="Don't know the watts? Snap the label"
                className="text-brand-blue hover:bg-brand-mist inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
              >
                <HelpCircle className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor={`${item.id}-qty`} className="text-xs">
            Quantity
          </Label>
          <Input
            id={`${item.id}-qty`}
            type="number"
            inputMode="numeric"
            min={LIMITS.qty.min}
            max={LIMITS.qty.max}
            value={item.qty}
            onChange={numberField('qty', true)}
            className="mt-1 h-11 text-base"
          />
        </div>
        <div>
          <Label htmlFor={`${item.id}-hours`} className="text-xs">
            Hours a day
          </Label>
          <Input
            id={`${item.id}-hours`}
            type="number"
            inputMode="decimal"
            min={LIMITS.hoursPerDay.min}
            max={LIMITS.hoursPerDay.max}
            step={0.5}
            value={item.hoursPerDay}
            onChange={numberField('hoursPerDay', false)}
            className="mt-1 h-11 text-base"
          />
        </div>
      </div>

      <p className="text-muted-foreground mt-2 text-xs tabular-nums">
        = {lineW.toLocaleString('en-US')} W running
        {item.surgeFactor > 1 &&
          ` · starts at ${(item.watts * item.surgeFactor).toLocaleString('en-US')} W`}
      </p>

      {photoLookup && (
        <WattsLookupDialog
          open={lookupOpen}
          itemName={item.name}
          onClose={() => setLookupOpen(false)}
          onUse={(watts) => {
            onChange({ watts })
            setLookupOpen(false)
          }}
        />
      )}
    </li>
  )
}
