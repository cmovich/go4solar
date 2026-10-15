'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { CATEGORY_LABELS } from '@/lib/load/categories'
import { CATEGORY_IDS, type CategoryId } from '@/lib/load/types'
import type { ApplianceDraft } from '@/lib/pricing/adminSchemas'

import { saveAppliance } from '@/app/admin/(shell)/appliances/actions'

export type ApplianceRowView = ApplianceDraft & { id: string }

function Row({ initial, canEdit }: { initial: ApplianceRowView; canEdit: boolean }) {
  const router = useRouter()
  const [row, setRow] = useState<ApplianceRowView>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(row) !== JSON.stringify(initial)
  const num = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0)

  function save() {
    setError(null)
    start(async () => {
      const r = await saveAppliance(row)
      if (r.ok) router.refresh()
      else setError(r.error)
    })
  }

  const cell = 'h-9 text-sm'
  return (
    <>
      <tr className="border-t">
        <td className="px-2 py-1">
          <Input
            value={row.name}
            onChange={(e) => setRow({ ...row, name: e.target.value })}
            className={`${cell} min-w-44`}
            disabled={!canEdit}
            aria-label="Name"
          />
        </td>
        <td className="px-2 py-1">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            value={row.defaultWatts}
            onChange={(e) => setRow({ ...row, defaultWatts: Math.round(num(e.target.value)) })}
            className={`${cell} w-24`}
            disabled={!canEdit}
            aria-label="Default watts"
          />
        </td>
        <td className="px-2 py-1">
          <Input
            type="number"
            inputMode="decimal"
            min={1}
            max={10}
            step={0.5}
            value={row.surgeFactor}
            onChange={(e) => setRow({ ...row, surgeFactor: num(e.target.value) })}
            className={`${cell} w-20`}
            disabled={!canEdit}
            aria-label="Surge factor"
          />
        </td>
        <td className="px-2 py-1">
          <Input
            type="number"
            inputMode="decimal"
            min={0.05}
            max={1}
            step={0.05}
            value={row.dutyCycle}
            onChange={(e) => setRow({ ...row, dutyCycle: num(e.target.value) })}
            className={`${cell} w-20`}
            disabled={!canEdit}
            aria-label="Duty cycle"
          />
        </td>
        <td className="px-2 py-1">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={24}
            step={0.5}
            value={row.defaultHours}
            onChange={(e) => setRow({ ...row, defaultHours: num(e.target.value) })}
            className={`${cell} w-20`}
            disabled={!canEdit}
            aria-label="Default hours"
          />
        </td>
        <td className="px-2 py-1">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={row.sort}
            onChange={(e) => setRow({ ...row, sort: Math.round(num(e.target.value)) })}
            className={`${cell} w-16`}
            disabled={!canEdit}
            aria-label="Sort"
          />
        </td>
        <td className="px-2 py-1 text-center">
          <Checkbox
            checked={row.active}
            onCheckedChange={(v) => setRow({ ...row, active: v === true })}
            disabled={!canEdit}
            aria-label="Active"
          />
        </td>
        <td className="px-2 py-1 whitespace-nowrap">
          {canEdit && (
            <Button type="button" size="sm" onClick={save} disabled={!dirty || pending}>
              {pending ? '…' : 'Save'}
            </Button>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={8} className="px-2 pb-2">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </td>
        </tr>
      )}
    </>
  )
}

export function ApplianceEditor({ rows, canEdit }: { rows: ApplianceRowView[]; canEdit: boolean }) {
  const router = useRouter()
  const [adding, setAdding] = useState<ApplianceDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function addNew() {
    if (!adding) return
    setError(null)
    start(async () => {
      const r = await saveAppliance(adding)
      if (r.ok) {
        setAdding(null)
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <div className="space-y-8">
      {canEdit && (
        <div className="bg-brand-mist rounded-xl p-4">
          {adding ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs">
                Category
                <select
                  value={adding.category}
                  onChange={(e) => setAdding({ ...adding, category: e.target.value as CategoryId })}
                  className="border-input mt-1 block h-9 rounded-md border bg-white px-2 text-sm"
                >
                  {CATEGORY_IDS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Name
                <Input
                  value={adding.name}
                  onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                  className="mt-1 h-9 w-48"
                />
              </label>
              <label className="text-xs">
                Watts
                <Input
                  type="number"
                  value={adding.defaultWatts}
                  onChange={(e) =>
                    setAdding({ ...adding, defaultWatts: parseInt(e.target.value, 10) || 0 })
                  }
                  className="mt-1 h-9 w-24"
                />
              </label>
              <label className="text-xs">
                Hours/day
                <Input
                  type="number"
                  step={0.5}
                  value={adding.defaultHours}
                  onChange={(e) =>
                    setAdding({ ...adding, defaultHours: parseFloat(e.target.value) || 0 })
                  }
                  className="mt-1 h-9 w-24"
                />
              </label>
              <Button type="button" size="sm" onClick={addNew} disabled={pending}>
                Add
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAdding(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setAdding({
                  category: 'lighting',
                  name: '',
                  defaultWatts: 10,
                  surgeFactor: 1,
                  dutyCycle: 1,
                  defaultHours: 6,
                  sort: 999,
                  active: true,
                })
              }
            >
              Add appliance
            </Button>
          )}
          {error && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {CATEGORY_IDS.map((c) => {
        const inCat = rows.filter((r) => r.category === c)
        if (inCat.length === 0) return null
        return (
          <section key={c}>
            <h2 className="text-brand-dark text-lg font-semibold">{CATEGORY_LABELS[c]}</h2>
            <div className="mt-2 overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-brand-green text-left text-white">
                  <tr>
                    {['Name', 'Watts', 'Surge ×', 'Duty', 'Hours/day', 'Sort', 'Active', ''].map(
                      (h) => (
                        <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {inCat.map((r) => (
                    <Row key={r.id} initial={r} canEdit={canEdit} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
