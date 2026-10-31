'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  deleteRoofType,
  moveRoofType,
  saveRoofType,
  setRoofTypeActive,
} from '@/lib/content/actions'
import { Checkbox } from '@/components/ui/checkbox'
import { NairaField } from '@/components/admin/NairaField'
import { formatNaira } from '@/lib/money'

import { ImageUpload } from './ImageUpload'

export type RoofTypeRow = {
  id: string
  name: string
  description: string
  photo: string | null
  photoUrl: string | null
  needsRack: boolean
  active: boolean
  sample: boolean
  /** Undefined before migration 0027. */
  installPrice?: number
  installPriceUnit?: 'per_panel' | 'per_kw'
}

type Draft = {
  id?: string
  name: string
  description: string
  photo: string | null
  photoUrl: string | null
  needsRack: boolean
  installPrice?: number
  installPriceUnit?: 'per_panel' | 'per_kw'
}
const EMPTY: Draft = { name: '', description: '', photo: null, photoUrl: null, needsRack: true }

function Editor({
  initial,
  onDone,
  canPrice,
}: {
  initial: Draft
  onDone: () => void
  canPrice: boolean
}) {
  const router = useRouter()
  const [d, setD] = useState<Draft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    start(async () => {
      const r = await saveRoofType({
        id: d.id,
        name: d.name,
        description: d.description,
        photo: d.photo,
        needsRack: d.needsRack,
        ...(canPrice
          ? {
              installPrice: d.installPrice ?? 0,
              installPriceUnit: d.installPriceUnit ?? 'per_panel',
            }
          : {}),
      })
      if (r.ok) {
        onDone()
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <div className="bg-brand-mist space-y-4 rounded-xl p-4" data-testid="roof-editor">
      <h2 className="text-brand-dark text-lg font-semibold">
        {d.id ? 'Edit roof type' : 'Add a roof type'}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="p-name">Name</Label>
          <Input
            id="p-name"
            value={d.name}
            onChange={(e) => setD({ ...d, name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-desc">Short description (optional)</Label>
          <Input
            id="p-desc"
            maxLength={200}
            value={d.description}
            onChange={(e) => setD({ ...d, description: e.target.value })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={d.needsRack}
          onCheckedChange={(v) => setD({ ...d, needsRack: v === true })}
        />
        Needs a rack to mount panels safely
      </label>
      {canPrice && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="p-price">Installation extra on this roof (no markup)</Label>
            <NairaField
              id="p-price"
              value={d.installPrice ?? 0}
              onChange={(v) => setD({ ...d, installPrice: v })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-unit">Charged</Label>
            <select
              id="p-unit"
              className="border-input h-10 w-full rounded-md border bg-white px-2 text-sm"
              value={d.installPriceUnit ?? 'per_panel'}
              onChange={(e) =>
                setD({
                  ...d,
                  installPriceUnit: e.target.value === 'per_kw' ? 'per_kw' : 'per_panel',
                })
              }
            >
              <option value="per_panel">per panel</option>
              <option value="per_kw">per kW of panels</option>
            </select>
          </div>
        </div>
      )}
      <ImageUpload
        kind="roof"
        label="Photo (JPG, PNG or WebP; cropped to 4:3)"
        previewUrl={d.photoUrl}
        onUploaded={(path, url) => setD({ ...d, photo: path, photoUrl: url })}
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function RoofTypesAdmin({
  rows,
  canPrice = false,
}: {
  rows: RoofTypeRow[]
  /** Super admin, after migration 0027: show the installation price fields. */
  canPrice?: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    start(async () => {
      const r = await action()
      if (r.ok) router.refresh()
      else setError(r.error)
    })
  }

  return (
    <div className="space-y-6">
      {editing ? (
        <Editor initial={editing} onDone={() => setEditing(null)} canPrice={canPrice} />
      ) : (
        <Button type="button" onClick={() => setEditing(EMPTY)}>
          Add a roof type
        </Button>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <ol className="space-y-3" data-testid="roof-list">
        {rows.map((p, i) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4"
          >
            {p.photoUrl ? (
              <Image
                src={p.photoUrl}
                alt=""
                width={96}
                height={72}
                unoptimized
                className="h-[72px] w-24 rounded-md object-cover"
              />
            ) : (
              <span className="bg-brand-mist text-muted-foreground flex h-[72px] w-24 items-center justify-center rounded-md text-xs">
                no photo
              </span>
            )}
            <div className="min-w-40 flex-1 text-sm">
              <p className="text-brand-dark font-semibold">
                {p.name}{' '}
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${p.active ? 'bg-brand-green text-white' : 'bg-muted text-muted-foreground'}`}
                >
                  {p.active ? 'Showing' : 'Hidden'}
                </span>
                {p.sample && (
                  <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    SAMPLE
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                {p.description || '—'} · {p.needsRack ? 'needs a rack' : 'no rack needed'}
                {p.installPrice !== undefined &&
                  ` · installation +${formatNaira(p.installPrice)} ${p.installPriceUnit === 'per_kw' ? 'per kW' : 'per panel'}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-label={`Move ${p.name} up`}
                disabled={pending || i === 0}
                onClick={() => run(() => moveRoofType({ id: p.id, dir: 'up' }))}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Move ${p.name} down`}
                disabled={pending || i === rows.length - 1}
                onClick={() => run(() => moveRoofType({ id: p.id, dir: 'down' }))}
              >
                ↓
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing({ ...p })}>
                Edit
              </Button>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => setRoofTypeActive({ id: p.id, active: !p.active }))}
              >
                {p.active ? 'Hide' : 'Show'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Delete ${p.name}?`)) run(() => deleteRoofType({ id: p.id }))
                }}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-muted-foreground text-sm">No roof types yet.</li>}
      </ol>
    </div>
  )
}
