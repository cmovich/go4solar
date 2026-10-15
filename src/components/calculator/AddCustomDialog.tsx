'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CATEGORY_LABELS } from '@/lib/load/categories'
import { LIMITS } from '@/lib/load/totals'
import { CATEGORY_IDS, type CategoryId } from '@/lib/load/types'

const schema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(80, 'Keep the name short'),
  watts: z
    .number({ error: 'Enter the watts' })
    .min(LIMITS.watts.min, `At least ${LIMITS.watts.min} W`)
    .max(LIMITS.watts.max, `At most ${LIMITS.watts.max.toLocaleString('en-US')} W`),
  category: z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]]),
})

export type CustomItemInput = z.infer<typeof schema>

export function AddCustomDialog({
  category,
  onClose,
  onAdd,
}: {
  /** Open when a category is given (pre-selects it). */
  category: CategoryId | null
  onClose: () => void
  onAdd: (input: CustomItemInput) => void
}) {
  const [name, setName] = useState('')
  const [watts, setWatts] = useState('')
  const [selected, setSelected] = useState<CategoryId>('lighting')
  const [errors, setErrors] = useState<Partial<Record<keyof CustomItemInput, string>>>({})

  useEffect(() => {
    if (category) {
      setSelected(category)
      setName('')
      setWatts('')
      setErrors({})
    }
  }, [category])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = schema.safeParse({
      name,
      watts: watts === '' ? undefined : Number(watts),
      category: selected,
    })
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key === 'name' || key === 'watts' || key === 'category') next[key] = issue.message
      }
      setErrors(next)
      return
    }
    onAdd(parsed.data)
  }

  return (
    <Dialog open={category !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle className="text-brand-dark">Add your own appliance</DialogTitle>
            <DialogDescription>
              The watts are usually printed on a label at the back or bottom of the appliance.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="custom-name">Name</Label>
              <Input
                id="custom-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Chandelier"
                className="mt-1 h-11 text-base"
                autoFocus
              />
              {errors.name && <p className="text-destructive mt-1 text-sm">{errors.name}</p>}
            </div>
            <div>
              <Label htmlFor="custom-watts">Watts</Label>
              <Input
                id="custom-watts"
                type="number"
                inputMode="numeric"
                min={LIMITS.watts.min}
                max={LIMITS.watts.max}
                value={watts}
                onChange={(e) => setWatts(e.target.value)}
                placeholder="e.g. 120"
                className="mt-1 h-11 text-base"
              />
              {errors.watts && <p className="text-destructive mt-1 text-sm">{errors.watts}</p>}
            </div>
            <div>
              <Label htmlFor="custom-category">Category</Label>
              <select
                id="custom-category"
                value={selected}
                onChange={(e) => setSelected(e.target.value as CategoryId)}
                className="border-input mt-1 h-11 w-full rounded-md border bg-white px-3 text-base"
              >
                {CATEGORY_IDS.map((id) => (
                  <option key={id} value={id}>
                    {CATEGORY_LABELS[id]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="h-11">
              Add appliance
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
