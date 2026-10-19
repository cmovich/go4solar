'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  deleteTestimonial,
  moveTestimonial,
  saveTestimonial,
  setTestimonialPublished,
} from '@/lib/content/actions'
import { publishProblem, type TestimonialInput } from '@/lib/content/schemas'

import { ImageUpload } from './ImageUpload'

export type TestimonialRow = {
  id: string
  clientName: string
  clientCity: string
  clientQuote: string
  systemSize: string
  installerName: string
  installerPhoto: string | null
  jobPhoto: string | null
  installerPhotoUrl: string | null
  jobPhotoUrl: string | null
  consentClient: boolean
  consentInstaller: boolean
  published: boolean
  isTest: boolean
}

type Draft = TestimonialInput & { installerPhotoUrl: string | null; jobPhotoUrl: string | null }

const EMPTY: Draft = {
  clientName: '',
  clientCity: '',
  clientQuote: '',
  systemSize: '',
  installerName: '',
  installerPhoto: null,
  jobPhoto: null,
  installerPhotoUrl: null,
  jobPhotoUrl: null,
  consentClient: false,
  consentInstaller: false,
}

function Editor({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const router = useRouter()
  const [d, setD] = useState<Draft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))

  function save() {
    setError(null)
    start(async () => {
      const r = await saveTestimonial(d)
      if (r.ok) {
        onDone()
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <div className="bg-brand-mist space-y-4 rounded-xl p-4" data-testid="testimonial-editor">
      <h2 className="text-brand-dark text-lg font-semibold">
        {d.id ? 'Edit testimonial' : 'Add a testimonial'}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['clientName', 'Client first name'],
            ['clientCity', 'City'],
            ['systemSize', 'System size (e.g. 3.5 kVA · 7.5 kWh)'],
            ['installerName', 'Installer name'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`t-${key}`}>{label}</Label>
            <Input
              id={`t-${key}`}
              value={d[key]}
              onChange={(e) => set({ [key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor="t-quote">Client quote</Label>
        <textarea
          id="t-quote"
          value={d.clientQuote}
          maxLength={220}
          rows={3}
          onChange={(e) => set({ clientQuote: e.target.value })}
          className="border-input w-full rounded-md border bg-white px-3 py-2 text-sm"
        />
        <p className="text-muted-foreground text-xs">{d.clientQuote.length} / 220 characters</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageUpload
          kind="installer"
          label="Installer photo (face)"
          previewUrl={d.installerPhotoUrl}
          onUploaded={(path, url) => set({ installerPhoto: path, installerPhotoUrl: url })}
        />
        <ImageUpload
          kind="job"
          label="Job photo (the installation)"
          previewUrl={d.jobPhotoUrl}
          onUploaded={(path, url) => set({ jobPhoto: path, jobPhotoUrl: url })}
        />
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={d.consentClient}
            onCheckedChange={(v) => set({ consentClient: v === true })}
          />
          The client agreed in writing to their first name, city, quote and photo being shown.
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={d.consentInstaller}
            onCheckedChange={(v) => set({ consentInstaller: v === true })}
          />
          The installer agreed in writing to their name and photo being shown.
        </label>
      </div>
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

export function TestimonialsAdmin({ rows }: { rows: TestimonialRow[] }) {
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
          Add a testimonial
        </Button>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <ol className="space-y-3" data-testid="testimonial-list">
        {rows.map((t, i) => {
          const blocked = publishProblem(t)
          return (
            <li
              key={t.id}
              className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row"
            >
              {t.jobPhotoUrl && (
                <Image
                  src={t.jobPhotoUrl}
                  alt=""
                  width={120}
                  height={80}
                  unoptimized
                  className="h-20 w-30 rounded-md object-cover"
                />
              )}
              <div className="flex-1 space-y-1 text-sm">
                <p className="text-brand-dark font-semibold">
                  {t.clientName}, {t.clientCity} · {t.systemSize}{' '}
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${t.published ? 'bg-brand-green text-white' : 'bg-muted text-muted-foreground'}`}
                  >
                    {t.published ? 'Published' : 'Not published'}
                  </span>
                  {t.isTest && (
                    <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      test
                    </span>
                  )}
                </p>
                <p>&ldquo;{t.clientQuote}&rdquo;</p>
                <p className="text-muted-foreground text-xs">
                  Installer: {t.installerName} · Consent: client {t.consentClient ? '✓' : '✗'},
                  installer {t.consentInstaller ? '✓' : '✗'}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Move ${t.clientName} up`}
                  disabled={pending || i === 0}
                  onClick={() => run(() => moveTestimonial({ id: t.id, dir: 'up' }))}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Move ${t.clientName} down`}
                  disabled={pending || i === rows.length - 1}
                  onClick={() => run(() => moveTestimonial({ id: t.id, dir: 'down' }))}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEditing({
                      ...t,
                      installerPhoto: t.installerPhoto,
                      jobPhoto: t.jobPhoto,
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  disabled={pending || (!t.published && blocked !== null)}
                  title={!t.published && blocked ? blocked : undefined}
                  onClick={() =>
                    run(() => setTestimonialPublished({ id: t.id, published: !t.published }))
                  }
                >
                  {t.published ? 'Unpublish' : 'Publish'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Delete the testimonial from ${t.clientName}?`))
                      run(() => deleteTestimonial({ id: t.id }))
                  }}
                >
                  Delete
                </Button>
              </div>
              {!t.published && blocked && (
                <p className="text-xs text-amber-800 sm:hidden">{blocked}</p>
              )}
            </li>
          )
        })}
        {rows.length === 0 && (
          <li className="text-muted-foreground text-sm">
            No testimonials yet. The home page does not show the section until one is published.
          </li>
        )}
      </ol>
    </div>
  )
}
