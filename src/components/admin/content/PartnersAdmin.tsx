'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deletePartner, movePartner, savePartner, setPartnerActive } from '@/lib/content/actions'

import { ImageUpload } from './ImageUpload'

export type PartnerRow = {
  id: string
  name: string
  logo: string | null
  logoUrl: string | null
  websiteUrl: string
  active: boolean
  isTest: boolean
}

type Draft = {
  id?: string
  name: string
  logo: string | null
  logoUrl: string | null
  websiteUrl: string
}
const EMPTY: Draft = { name: '', logo: null, logoUrl: null, websiteUrl: '' }

function Editor({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const router = useRouter()
  const [d, setD] = useState<Draft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    start(async () => {
      const r = await savePartner({
        id: d.id,
        name: d.name,
        logo: d.logo,
        websiteUrl: d.websiteUrl,
      })
      if (r.ok) {
        onDone()
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <div className="bg-brand-mist space-y-4 rounded-xl p-4" data-testid="partner-editor">
      <h2 className="text-brand-dark text-lg font-semibold">
        {d.id ? 'Edit partner' : 'Add a partner'}
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
          <Label htmlFor="p-url">Website (optional)</Label>
          <Input
            id="p-url"
            type="url"
            placeholder="https://"
            value={d.websiteUrl}
            onChange={(e) => setD({ ...d, websiteUrl: e.target.value })}
          />
        </div>
      </div>
      <ImageUpload
        kind="logo"
        label="Logo (PNG with transparency, SVG, JPG or WebP)"
        previewUrl={d.logoUrl}
        onUploaded={(path, url) => setD({ ...d, logo: path, logoUrl: url })}
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

export function PartnersAdmin({ rows }: { rows: PartnerRow[] }) {
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
        <Editor initial={editing} onDone={() => setEditing(null)} />
      ) : (
        <Button type="button" onClick={() => setEditing(EMPTY)}>
          Add a partner
        </Button>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <ol className="space-y-3" data-testid="partner-list">
        {rows.map((p, i) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4"
          >
            {p.logoUrl ? (
              <Image
                src={p.logoUrl}
                alt=""
                width={96}
                height={48}
                unoptimized
                className="h-12 w-24 object-contain"
              />
            ) : (
              <span className="bg-brand-mist text-muted-foreground flex h-12 w-24 items-center justify-center rounded-md text-xs">
                no logo
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
                {p.isTest && (
                  <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                    test
                  </span>
                )}
              </p>
              {p.websiteUrl && <p className="text-muted-foreground text-xs">{p.websiteUrl}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-label={`Move ${p.name} up`}
                disabled={pending || i === 0}
                onClick={() => run(() => movePartner({ id: p.id, dir: 'up' }))}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Move ${p.name} down`}
                disabled={pending || i === rows.length - 1}
                onClick={() => run(() => movePartner({ id: p.id, dir: 'down' }))}
              >
                ↓
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing({ ...p })}>
                Edit
              </Button>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => setPartnerActive({ id: p.id, active: !p.active }))}
              >
                {p.active ? 'Hide' : 'Show'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Delete ${p.name}?`)) run(() => deletePartner({ id: p.id }))
                }}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-muted-foreground text-sm">No partners yet.</li>}
      </ol>
    </div>
  )
}
